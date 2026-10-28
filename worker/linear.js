import { describeLine, formatCents } from "../src/commissionPricing.js";

const ENDPOINT = "https://api.linear.app/graphql";

const ISSUE_CREATE = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }
`;

const FILE_UPLOAD = `
  mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
    fileUpload(contentType: $contentType, filename: $filename, size: $size) {
      success
      uploadFile {
        uploadUrl
        assetUrl
        headers { key value }
      }
    }
  }
`;

export function linearConfigured(env) {
  return Boolean(env.LINEAR_API_KEY);
}

export function linearTeam(env, queue) {
  return queue?.linear_team_id || env.LINEAR_TEAM_ID || "";
}

const TEAM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TEAM_BY_KEY = `
  query TeamByKey($key: String!) {
    teams(filter: { key: { eq: $key } }) {
      nodes { id }
    }
  }
`;

const VIEWER = `
  query Viewer {
    viewer {
      name
      organization { name }
    }
  }
`;

async function linearQuery(env, query, variables, signal) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors?.length) {
    const reason = body?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`Linear rejected the request: ${reason}`);
  }
  return body?.data;
}

// A queue may store a team UUID or the key printed on issue numbers, such as ZAN.
async function resolveTeamId(env, value, signal) {
  const team = String(value || "").trim();
  if (!team || TEAM_ID.test(team)) return team;
  const data = await linearQuery(env, TEAM_BY_KEY, { key: team }, signal);
  const id = data?.teams?.nodes?.[0]?.id;
  if (!id) throw new Error(`Linear has no team ${team}.`);
  return id;
}

function description(request, queue, references = []) {
  const lines = [
    `**From:** ${request.usernames} <${request.email}>`,
    `**PayPal invoice to:** ${request.paypal_email || request.email}`,
    `**Queue:** ${queue.name}`,
    `**Catalog:** ${request.rating.toUpperCase()}`,
    `**Received:** ${request.created_at}`,
    "",
    "**Options**",
    "",
    ...JSON.parse(request.selections || "[]").map((line) => `- ${describeLine(line)}`),
    "",
    `**Quoted total:** ${formatCents(request.quote_cents)}`,
    "",
    request.description,
  ];
  if (references.length) {
    lines.push("", "**References**", "");
    for (const ref of references) lines.push(`![${ref.name}](${ref.assetUrl})`);
  }
  return lines.join("\n");
}

// Upload one held image into the Linear workspace and return its asset URL.
async function uploadToLinear(env, file) {
  const object = await env.GALLERY?.get(file.r2_key);
  if (!object) throw new Error(`Reference image ${file.name} is missing.`);
  const bytes = await object.arrayBuffer();

  const data = await linearQuery(env, FILE_UPLOAD, {
    contentType: file.content_type,
    filename: file.name,
    size: bytes.byteLength,
  });
  const payload = data?.fileUpload;
  if (!payload?.success) {
    throw new Error(`Linear rejected an upload: the upload was not accepted.`);
  }

  const { uploadUrl, assetUrl, headers } = payload.uploadFile;
  const putHeaders = new Headers();
  putHeaders.set("Content-Type", file.content_type);
  for (const header of headers || []) putHeaders.set(header.key, header.value);
  const put = await fetch(uploadUrl, { method: "PUT", headers: putHeaders, body: bytes });
  if (!put.ok) {
    throw new Error(`Linear upload failed for ${file.name}: HTTP ${put.status}`);
  }
  return { name: file.name, assetUrl };
}

export async function createCommissionIssue(env, request, queue, files = []) {
  const references = [];
  for (const file of files) {
    references.push(await uploadToLinear(env, file));
  }

  const teamId = await resolveTeamId(env, linearTeam(env, queue));
  if (!teamId) throw new Error(`No Linear team is set for ${queue.name}.`);
  const input = {
    teamId,
    title: `${queue.name}: ${request.usernames}`,
    description: description(request, queue, references),
  };
  const label = queue.linear_label_id || env.LINEAR_LABEL_ID;
  if (label) input.labelIds = [label];

  const data = await linearQuery(env, ISSUE_CREATE, { input });
  if (!data?.issueCreate?.success) throw new Error("Linear rejected the issue.");
  return data.issueCreate.issue;
}

function probeError(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "Linear did not answer.";
  return error instanceof Error ? error.message : "Linear request failed.";
}

// Confirms the API key and, when set, that the fallback team can be resolved.
export async function linearHealth(env) {
  if (!linearConfigured(env)) {
    return { configured: false, ok: false, detail: "API key is unset." };
  }
  const signal = AbortSignal.timeout(8000);
  try {
    const data = await linearQuery(env, VIEWER, undefined, signal);
    const viewer = data?.viewer?.name || "";
    const organization = data?.viewer?.organization?.name || "";
    if (env.LINEAR_TEAM_ID) await resolveTeamId(env, env.LINEAR_TEAM_ID, signal);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n, SUM(linear_team_id != '') AS teamed FROM commission_queues"
    ).first();
    const queues = Number(row?.n) || 0;
    const teamed = Number(row?.teamed) || 0;
    const missing = queues - teamed;
    let detail = viewer ? `Connected as ${viewer}` : "Connected";
    if (organization) detail += ` · ${organization}`;
    if (missing > 0 && !env.LINEAR_TEAM_ID) {
      detail += missing === 1 ? ". 1 queue has no team." : `. ${missing} queues have no team.`;
    }
    return { configured: true, ok: true, viewer, organization, detail };
  } catch (error) {
    const detail = probeError(error);
    console.error(JSON.stringify({ message: "linear health failed", error: detail }));
    return { configured: true, ok: false, detail };
  }
}

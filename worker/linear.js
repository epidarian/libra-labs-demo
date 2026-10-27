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

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.LINEAR_API_KEY,
    },
    body: JSON.stringify({
      query: FILE_UPLOAD,
      variables: {
        contentType: file.content_type,
        filename: file.name,
        size: bytes.byteLength,
      },
    }),
  });
  const body = await res.json().catch(() => null);
  const payload = body?.data?.fileUpload;
  if (!res.ok || body?.errors?.length || !payload?.success) {
    const reason = body?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`Linear rejected an upload: ${reason}`);
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

  const input = {
    teamId: linearTeam(env, queue),
    title: `${queue.name}: ${request.usernames}`,
    description: description(request, queue, references),
  };
  const label = queue.linear_label_id || env.LINEAR_LABEL_ID;
  if (label) input.labelIds = [label];

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query: ISSUE_CREATE, variables: { input } }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors?.length || !body?.data?.issueCreate?.success) {
    const reason = body?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(`Linear rejected the issue: ${reason}`);
  }
  return body.data.issueCreate.issue;
}

const ENDPOINT = "https://api.linear.app/graphql";

const ISSUE_CREATE = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }
`;

export function linearConfigured(env) {
  return Boolean(env.LINEAR_API_KEY && env.LINEAR_TEAM_ID);
}

function description(request) {
  const lines = [
    `**From:** ${request.name} <${request.email}>`,
    `**Catalog:** ${request.rating.toUpperCase()}`,
    `**Size:** ${request.size || "-"}`,
    `**Deadline:** ${request.deadline || "-"}`,
    `**Where it will be shown:** ${request.venue || "-"}`,
    `**Received:** ${request.created_at}`,
    "",
    request.message,
  ];
  return lines.join("\n");
}

export async function createCommissionIssue(env, request) {
  const input = {
    teamId: env.LINEAR_TEAM_ID,
    title: `Commission: ${request.name}`,
    description: description(request),
  };
  if (env.LINEAR_LABEL_ID) input.labelIds = [env.LINEAR_LABEL_ID];

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

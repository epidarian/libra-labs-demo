// Email/password accounts need a server to store users and verify passwords.
// Until one exists, sign-in runs in demo mode and no password is stored.
export const emailLive = false;

export function demoEmailProfile(email) {
  return {
    name: email.split("@")[0],
    email,
    image: null,
    provider: "email",
    patronStatus: null,
    amountCents: 0,
    demo: true,
  };
}

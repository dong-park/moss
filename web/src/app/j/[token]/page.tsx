import { InviteRoute } from "@/components/auth/InviteRoute";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteRoute token={token} />;
}

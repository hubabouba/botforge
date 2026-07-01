import Builder from "@/components/builder/Builder";

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  return <Builder botId={botId} />;
}

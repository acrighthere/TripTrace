import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import MapApp from "@/components/MapApp";

export default async function MapPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fmap");

  const styleUrl =
    process.env.MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

  return <MapApp styleUrl={styleUrl} userEmail={session.user.email ?? ""} />;
}

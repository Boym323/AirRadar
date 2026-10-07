import type { Metadata } from "next";
import { AirRadarPageShell } from "@/components/airradar-shell";
import { SavedWorkspaces } from "@/components/saved-workspaces";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved Workspaces — AirRadar",
};

export default function WorkspacesPage() {
  return <AirRadarPageShell><SavedWorkspaces /></AirRadarPageShell>;
}

import { createEditor, executeTool } from "./registry";
import type { ProjectView } from "./schema";
import type { ToolResult } from "./store";

export const browserEditor = createEditor();

let activeProjectId: string | null = null;

export function rememberProject(projectId: string): void {
  activeProjectId = projectId;
}

/** Opens the in-memory project the page is already editing, or creates one. */
export function ensureProject(name: string): ToolResult<ProjectView> {
  if (activeProjectId) {
    const existing = executeTool(browserEditor, "inspectProject", { projectId: activeProjectId });
    if (existing.ok) return existing as ToolResult<ProjectView>;
  }
  const created = executeTool(browserEditor, "createProject", { name });
  if (created.ok) {
    const view = created.output as ProjectView;
    activeProjectId = view.project.id;
  }
  return created as ToolResult<ProjectView>;
}

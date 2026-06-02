// Collaboration is explicitly out of scope. These stubs let the interactive-scene renderer compile
// and run; with no collaborators in app state, the consumers are effectively no-ops (no remote
// cursors or remote selections are ever rendered). Replace with the real module only if/when
// real-time collaboration is brought into scope.
import type { Collaborator, SocketId } from "./types";

export const getClientColor = (
  _socketId: SocketId,
  collaborator: Collaborator | undefined,
): string => collaborator?.color?.background ?? "#000000";

export const renderRemoteCursors = (_opts: {
  context: CanvasRenderingContext2D;
  renderConfig: unknown;
  appState: unknown;
  normalizedWidth: number;
  normalizedHeight: number;
}): void => {
  // no-op — collaboration out of scope
};

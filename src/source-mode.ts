/**
 * Given a file extension and the current editor state, returns the new state
 * if the editor should be switched to plain source mode, or null if no change needed.
 */
export function getSourceModeState(
	extension: string | undefined,
	state: { mode?: string; source?: boolean; [key: string]: unknown }
): { mode: string; source: boolean; [key: string]: unknown } | null {
	if (extension !== "mdx") return null;
	if (state.mode === "source" && state.source === true) return null;
	return { ...state, mode: "source", source: true };
}

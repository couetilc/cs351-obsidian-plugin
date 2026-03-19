import { App, SuggestModal } from "obsidian";
import type { AssignmentSummary } from "./sync";

export class AssignmentPickerModal extends SuggestModal<AssignmentSummary> {
	private assignments: AssignmentSummary[];
	private onChoose: (assignment: AssignmentSummary) => void;

	constructor(
		app: App,
		assignments: AssignmentSummary[],
		onChoose: (assignment: AssignmentSummary) => void
	) {
		super(app);
		this.assignments = assignments;
		this.onChoose = onChoose;
		this.setPlaceholder("Select an assignment...");
	}

	getSuggestions(query: string): AssignmentSummary[] {
		const lower = query.toLowerCase();
		return this.assignments.filter(
			(a) =>
				a.name.toLowerCase().includes(lower) ||
				a.course_name.toLowerCase().includes(lower)
		);
	}

	renderSuggestion(assignment: AssignmentSummary, el: HTMLElement): void {
		el.createEl("div", { text: assignment.name });
		el.createEl("small", { text: assignment.course_name });
	}

	onChooseSuggestion(assignment: AssignmentSummary): void {
		this.onChoose(assignment);
	}
}

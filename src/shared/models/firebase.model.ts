export interface AdvicePrompt {
	id: string;
	category: string;
	description: string;
	prompt: string;
}

export interface Expense {
	id: string;
	amount: string;
	category: string;
	comment: string;
	date: string;
	expenseName: string;
	selectedDate: string;
}

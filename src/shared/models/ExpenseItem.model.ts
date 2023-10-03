interface ExpenseItem {
	id: string;
	comment?: string;
	date: {
		seconds: number;
		nanoseconds: number;
	};
	expenseName: string;
	amount: string | number;
	selectedDate: string;
	category: string;
	currencyQuantity?: string;
	currencyExchangeRate?: string;
}

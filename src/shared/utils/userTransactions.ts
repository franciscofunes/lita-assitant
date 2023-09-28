import { UserInfo } from '../models/UserInfo';

// userContext.ts
let userTransactionsData: any | null = null;

export const setUserTransactions = (data: UserInfo) => {
	userTransactionsData = data;
};

export const getUserTransactions = (): UserInfo | null => {
	return userTransactionsData;
};

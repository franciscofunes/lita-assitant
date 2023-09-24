import { UserInfo } from '../models/UserInfo';

// userContext.ts
let userContextData: UserInfo | null = null;

export const setUserContext = (data: UserInfo) => {
	userContextData = data;
};

export const getUserContext = (): UserInfo | null => {
	return userContextData;
};

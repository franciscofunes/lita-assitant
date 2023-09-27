// UserContext.tsx

import React, { createContext, useContext, useState } from 'react';
import { UserInfo } from '../models/UserInfo';

export interface UserContextType {
	userContext: UserInfo | null;
	updateUserContext: (userInfo: UserInfo) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserContextProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [userContext, setUserContext] = useState<UserInfo | null>(null);

	const updateUserContext = (userInfo: UserInfo) => {
		setUserContext(userInfo);
	};

	return (
		<UserContext.Provider value={{ userContext, updateUserContext }}>
			{children}
		</UserContext.Provider>
	);
}

export function useUserContext() {
	const context = useContext(UserContext);
	if (context === undefined) {
		throw new Error('useUserContext must be used within a UserContextProvider');
	}
	return context;
}

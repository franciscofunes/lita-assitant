import { AdvicePrompt, Expense } from '@/shared/models/firebase.model';
import { getDocs } from '@firebase/firestore';
import {
	DocumentSnapshot,
	collection,
	limit,
	orderBy,
	query,
} from 'firebase/firestore';
import Cookies from 'js-cookie';
import { database } from '../../../firebaseConfig';

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Message } from 'ai';
import { UserInfo } from '../models/UserInfo';

export const advicePromptsCollection = collection(database, 'advices_prompts');

export async function getAdvicePrompts(): Promise<AdvicePrompt[]> {
	const querySnapshot = await getDocs(advicePromptsCollection);

	const advicePrompts: AdvicePrompt[] = querySnapshot.docs.map(
		(doc: DocumentSnapshot) => doc.data() as AdvicePrompt
	);

	return advicePrompts;
}

export async function getLastFiveExpensesWithCookie(): Promise<Expense[]> {
	// Parse the userContext cookie to extract the UID
	const userContextCookie = Cookies.get('userContext');
	if (!userContextCookie) {
		throw new Error('User context cookie not found.');
	}

	const userContext = JSON.parse(decodeURIComponent(userContextCookie));
	const uid = userContext.uid;

	// Query the user's transactions collection
	const transactionsCollection = collection(database, 'users', uid, 'expenses');

	// Create a query to get the last five transactions based on the date
	const transactionQuery = query(
		transactionsCollection,
		orderBy('date', 'desc'), // Sort by date in descending order
		limit(5) // Limit to the last five transactions
	);

	const querySnapshot = await getDocs(transactionQuery);

	const lastFiveTransactions: Expense[] = querySnapshot.docs.map(
		(doc: DocumentSnapshot) => doc.data() as Expense
	);

	return lastFiveTransactions;
}

export async function getLastFiveExpenses(
	userContext: UserInfo
): Promise<Expense[]> {
	// Extract the UID from the userContext
	const uid = userContext.uid;

	// Query the user's transactions collection
	const transactionsCollection = collection(database, 'users', uid, 'expenses');

	// Create a query to get the last five transactions based on the date
	const transactionQuery = query(
		transactionsCollection,
		orderBy('date', 'desc'), // Sort by date in descending order
		limit(5) // Limit to the last five transactions
	);

	const querySnapshot = await getDocs(transactionQuery);

	const lastFiveTransactions: Expense[] = querySnapshot.docs.map(
		(doc: DocumentSnapshot) => doc.data() as Expense
	);

	return lastFiveTransactions;
}

export const chatHistoryCollection = collection(database, 'chat_history');

// New method to save chat history
// export async function saveChatHistory(
// 	userId: string,
// 	userPrompt: string,
// 	chatResponse: string
// ) {
// 	try {
// 		// Create a reference to the user's document
// 		const userDocRef = doc(collection(database, 'users'), userId);

// 		// Create a reference to a new document in the chat_history collection
// 		const chatHistoryDocRef = doc(collection(userDocRef, 'chat_history'));

// 		// This part is optional: if you want to include chat_history within the user's document
// 		await setDoc(
// 			userDocRef,
// 			{
// 				chat_history: {
// 					[chatHistoryDocRef.id]: {
// 						// Use the document ID as the key
// 						timestamp: serverTimestamp(),
// 						user_prompt: userPrompt,
// 						ai_response: chatResponse,
// 					},
// 				},
// 			},
// 			{ merge: true }
// 		);
// 	} catch (error) {
// 		console.error('Error saving chat history:', error);
// 		throw error;
// 	}
// }

export async function saveChatHistory(userId: string, messages: Message[]) {
	try {
		// Create a reference to the user's document
		const userDocRef = doc(collection(database, 'users'), userId);

		// Create a reference to a new document in the chat_history collection
		const chatHistoryDocRef = doc(collection(userDocRef, 'chat_history'));

		// Extract role and content from each message and create an array of message objects
		const chatHistory = messages.map((message) => ({
			role: message.role,
			content: message.content,
		}));

		// Save the chat history to Firestore
		await setDoc(chatHistoryDocRef, { messages: chatHistory });

		// Optionally, you can also update the user's document with the chat history
		await setDoc(
			userDocRef,
			{
				chat_history: {
					[chatHistoryDocRef.id]: {
						// Use the document ID as the key
						timestamp: serverTimestamp(),
						...chatHistory,
					},
				},
			},
			{ merge: true }
		);
	} catch (error) {
		console.error('Error saving chat history:', error);
		throw error;
	}
}

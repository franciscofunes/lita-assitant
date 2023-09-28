import { UserInfo } from '@/shared/models/UserInfo';
import {
	getUserTransactions,
	setUserTransactions,
} from '@/shared/utils/userTransactions';
// import { cookies } from 'next/headers';

export async function POST(req: Request) {
	const userInfo: UserInfo = await req.json();
	const statusCode = 200;
	const message = `User information received:, ${JSON.stringify(userInfo)} `;

	// Set the user context data in your userContext module
	setUserTransactions(userInfo);

	return new Response(message, {
		status: statusCode,
		statusText: 'OK',
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

export async function GET(req: Request) {
	try {
		// Retrieve the user context data from your userContext module
		const userContext = getUserTransactions(); // Implement this function

		if (!userContext) {
			throw new Error('User context not found');
		}

		const statusCode = 200;
		const message = JSON.stringify(userContext);

		return new Response(message, {
			status: statusCode,
			statusText: 'OK',
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error: any) {
		const statusCode = 500;
		const message = `Error: ${error.message}`;

		return new Response(message, {
			status: statusCode,
			statusText: 'Internal Server Error',
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
}

import { UserInfo } from '@/shared/models/UserInfo';
import {
	getUserTransactions,
	setUserTransactions,
} from '@/shared/utils/userTransactions';
// import { cookies } from 'next/headers';

export async function POST(req: Request) {
	const userTransactions: UserInfo = await req.json();
	const statusCode = 200;
	const message = `User transactions received:, ${JSON.stringify(
		userTransactions
	)} `;

	setUserTransactions(userTransactions);

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
		const userTransactions = getUserTransactions();

		if (!userTransactions) {
			throw new Error(
				'User transactions not found in user-context GET endpoint'
			);
		}

		const statusCode = 200;
		const message = JSON.stringify(userTransactions);

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

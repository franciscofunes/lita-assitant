import { UserInfo } from '@/shared/models/UserInfo';
import { getUserContext, setUserContext } from '@/shared/utils/userContext';
import Cookies from 'js-cookie';

export async function POST(req: Request) {
	const userInfo: UserInfo = await req.json();
	const statusCode = 200;
	const message = `User information received:, ${JSON.stringify(userInfo)} `;

	// Set the user context data in your userContext module
	setUserContext(userInfo);

	// Save the user context in a cookie named "userContext"
	Cookies.set('userContext', JSON.stringify(userInfo));

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
		const userContext = getUserContext(); // Implement this function

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

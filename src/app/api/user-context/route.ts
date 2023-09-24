import { UserInfo } from '@/shared/models/UserInfo';
import { setUserContext } from '@/shared/utils/userContext';

export async function POST(req: Request) {
	const userInfo: UserInfo = await req.json();
	const statusCode = 200;
	const message = `User information received:, ${JSON.stringify(userInfo)} `;

	// Set the user context data in your userContext module
	setUserContext(userInfo);

	return new Response(message, {
		status: statusCode,
		statusText: 'OK',
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

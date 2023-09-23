import { NextApiRequest, NextApiResponse } from 'next';
import { NextResponse } from 'next/server';
import { userInfo } from 'os';

// Define the structure of the user information
export interface UserInfo {
	uid: string;
	email: string;
	emailVerified: boolean;
	displayName: string;
	isAnonymous: boolean;
	photoURL: string;
	providerData: {
		providerId: string;
		uid: string;
		displayName: string;
		email: string;
		phoneNumber: string | null;
		photoURL: string;
	}[];
	stsTokenManager: {
		refreshToken: string;
		accessToken: string;
		expirationTime: number;
	};
	createdAt: string;
	lastLoginAt: string;
	apiKey: string;
	appName: string;
}

export async function POST(req: Request) {
	const userInfo: UserInfo = await req.json();
	const statusCode = 200;
	const message = 'User information sent!';

	return new Response(message, {
		status: statusCode,
		statusText: 'OK',
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

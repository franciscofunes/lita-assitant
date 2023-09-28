import { collection, getDocs } from '@firebase/firestore';
import { firestore } from '../../../../firebaseConfig';

export async function GET() {
	try {
		const snapshot = await getDocs(collection(firestore, 'advices_prompts'));
		const data = snapshot.docs.map((doc) => ({
			id: doc.id,
			...doc.data(),
		}));

		const statusCode = 200;
		const message = JSON.stringify(data);

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

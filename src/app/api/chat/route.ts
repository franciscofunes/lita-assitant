import {
	ChatCompletionRequestMessageRoleEnum,
	Configuration,
	OpenAIApi,
} from 'openai-edge';
import { OpenAIStream, StreamingTextResponse } from 'ai';

const config = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(config);

export const runtime = 'edge';

export async function POST(req: Request) {
	const { messages } = await req.json();

	// Configure role for domestic economy advice
	const domesticEconomyAdviceRole = {
		role: ChatCompletionRequestMessageRoleEnum.System,
		content:
			'You are a AI called LITA that gives domestic economy advices and analize user expenses transactions only. You receive a text from the user that refers to any other topic do not answer, just said that you dont have the knowledge to answer. if the phrase of the user writes you the prompt message `Continua tu respuesta LITA` it means you have to continue with your previous response. Always be gentle and polite with the customer, and give shorter answers you can',
	};

	// Add the advice role message to the messages array
	messages.push(domesticEconomyAdviceRole);

	const response = await openai.createChatCompletion({
		model: 'gpt-3.5-turbo-0613',
		stream: true,
		messages,
		max_tokens: 200,
		temperature: 0.2,
		n: 1,
		top_p: 1,
		frequency_penalty: 1,
		presence_penalty: 1,
		stop: '/n',
	});

	const stream = OpenAIStream(response);

	return new StreamingTextResponse(stream);
}

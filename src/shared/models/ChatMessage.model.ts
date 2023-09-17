export interface ChatMessage {
	id: string; // Replace with the actual ID type
	role: 'user' | 'assistant'; // Match the roles allowed by the ai/react library
	content: string; // Content of the message
}

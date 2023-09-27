'use client';

import { UserInfo } from '@/shared/models/UserInfo';
import { AdvicePrompt } from '@/shared/models/firebase.model';
import {
	getAdvicePrompts,
	getLastFiveExpenses,
	getLastFiveExpensesWithCookie,
	saveChatHistory,
} from '@/shared/utils/firebaseUtils';
import { PaperPlaneIcon } from '@radix-ui/react-icons';
import { Strong, Text } from '@radix-ui/themes';
import { Message } from 'ai';
import { useChat } from 'ai/react';
import { motion } from 'framer-motion';
import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Card, CardContent, CardFooter } from './ui/card';
import CircleLoader from './ui/circle-loader';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';

const ASSITANT_PROMPT = '¿Quieres que continúe?';
const NO_ANSWER = 'Adios LITA, ya podemos finalizar la conversación';
const YES_ANSWER = `LITA dame con más consejos sobre economía doméstica`;
const INITIAL_MESSAGE =
	'¡Hola LITA! Me gustaría recibir un consejo corto sobre economía doméstica. ¿Por dónde crees que debería empezar?';

export function Chat() {
	const { messages, input, handleInputChange, handleSubmit, append } = useChat({
		api: '/api/chat',
	});

	const [loading, setLoading] = useState(true);
	const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
	const [advicesPrompts, setHardcodedOptions] = useState<AdvicePrompt[]>([]);
	const [chatHistory, setChatHistory] = useState<Message[]>([]);

	const handleButtonClick = (option: string) => {
		append({ role: 'user', content: option });
	};

	const handleAnswerClick = (answer: string) => {
		if (answer === NO_ANSWER) {
			// Send a message to the parent window to close the LITA assistant panel
			window.parent.postMessage('closeLitaPanel', '*'); // '*' allows communication with any origin
		} else {
			append({ role: 'user', content: answer });
		}
	};

	// const handleCookieMessage = (event: MessageEvent) => {
	// 	if (event.data && event.data.type === 'setCookie') {
	// 		const cookie = event.data.cookie;

	// 		// Parse the cookie string to extract the name and value
	// 		const cookieParts = cookie.split('=');
	// 		if (cookieParts.length === 2) {
	// 			const cookieName = decodeURIComponent(cookieParts[0]);
	// 			const cookieValue = decodeURIComponent(cookieParts[1]);

	// 			// Example: Set the received cookie in your application
	// 			Cookies.set(cookieName, cookieValue);
	// 		}
	// 	}
	// };

	const handleLastFiveExpensesClickWithCookies = async () => {
		try {
			const lastFiveExpenses = await getLastFiveExpensesWithCookie();
			if (lastFiveExpenses.length >= 5) {
				let message = `Por favor, analiza mis últimas cinco transacciones y dame un consejo teniendolas en cuenta:\n\n`;
				lastFiveExpenses.forEach((expense, index) => {
					message += `${index + 1}. Monto: ${expense.amount}, Categoría: ${
						expense.category
					}, Nombre de la transacción: ${expense.expenseName}\n`;
				});
				append({ role: 'user', content: message });
			} else {
				// Handle the case where there are less than 5 expenses
				append({
					role: 'user',
					content:
						'No hay suficientes gastos para analizar. Por favor, agregue más gastos.',
				});
			}
		} catch (error) {
			console.error('Error fetching last five expenses:', error);
		}
	};

	const handleLastFiveExpensesClick = async () => {
		try {
			const userContextResponse = await fetch('/api/user-context', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			});

			if (userContextResponse.ok) {
				const userContext = await userContextResponse.json();

				const lastFiveExpenses = await getLastFiveExpenses(userContext); // Pass userContext as a parameter

				if (lastFiveExpenses.length >= 5) {
					let message = `Por favor, analiza mis últimas cinco transacciones y dame un consejo de economía doméstica teniéndolas en cuenta:\n\n`;
					lastFiveExpenses.forEach((expense, index) => {
						message += `${index + 1}. Monto: ${expense.amount}, Categoría: ${
							expense.category
						}, Nombre de la transacción: ${expense.expenseName}\n`;
					});
					append({ role: 'user', content: message });
				} else {
					// Handle the case where there are fewer than 5 expenses
					append({
						role: 'user',
						content:
							'No hay suficientes gastos para analizar. Por favor, agregue más gastos.',
					});
				}
			} else {
				console.error('Failed to fetch user context');
			}
		} catch (error) {
			console.error(
				'Error fetching user context or last five expenses:',
				error
			);
		}
	};

	const saveChatToHistory = async (
		messages: Message[],
		userContext: UserInfo | null
	) => {
		try {
			if (!userContext) {
				throw new Error('User context not found.');
			}

			const uid = userContext.uid;

			await saveChatHistory(uid, messages);
		} catch (error) {
			console.error('Error handling the chat:', error);
		}
	};

	// useEffect(() => {
	// 	if (messages.length > chatHistory.length) {
	// 		// Update the chat history state with the entire messages object
	// 		setChatHistory([...messages]);

	// 		// Optionally, save the entire messages object to a history array
	// 		saveChatToHistory([...messages]);
	// 	}
	// }, [messages]);

	useEffect(() => {
		const fetchOptions = async () => {
			try {
				setLoading(true);
				const options = await getAdvicePrompts().then((response) => {
					setHardcodedOptions(response);
					setLoading(false);
				});
			} catch (error) {
				console.error('Error fetching advices prompts:', error);
				setLoading(false);
			}
		};

		fetchOptions();
	}, []);

	useEffect(() => {
		if (messages.length === 0) {
			append({
				role: 'user',
				content: INITIAL_MESSAGE,
			});
		}
	}, [messages]);

	// useEffect(() => {
	// 	const userCookie = Cookies.get('userContext');

	// 	if (userCookie) {
	// 		const decodedUserCookie = decodeURIComponent(userCookie);
	// 		const parsedUserInfo: CookieValue = JSON.parse(decodedUserCookie);

	// 		setUserInfo(parsedUserInfo);
	// 	}
	// }, []);

	// useEffect(() => {
	// 	// Add an event listener to listen for messages from the other application
	// 	window.addEventListener('message', handleCookieMessage);

	// 	return () => {
	// 		// Remove the event listener when the component unmounts
	// 		window.removeEventListener('message', handleCookieMessage);
	// 	};
	// }, []);

	// useEffect(() => {
	// 	const userContext = sessionStorage.getItem('userContext');

	// 	if (userContext) {
	// 		const parsedUserInfo: CookieValue = JSON.parse(userContext);

	// 		setUserInfo(parsedUserInfo);
	// 	}
	// }, []);

	// useEffect(() => {
	// 	const fetchUserContext = async () => {
	// 		const userContext = getUserContext();

	// 		console.log(userContext);

	// 		if (userContext) {
	// 			setUserInfo(userContext);
	// 		}
	// 	};

	// 	// Call the fetchUserContext function when dependencies change
	// 	fetchUserContext();
	// }, [getUserContext, setUserInfo]);

	// Inside your Chat component
	useEffect(() => {
		const fetchUserContext = async () => {
			try {
				const response = await fetch('/api/user-context', {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					},
				});

				if (response.ok) {
					const userContext = await response.json();
					// Save the user context in a cookie named "userContext"
					Cookies.set('userContext', JSON.stringify(userContext));

					setUserInfo(userContext);
					saveChatToHistory(messages, userContext);
					setLoading(false);
				} else {
					console.error('Failed to fetch user context');
				}
			} catch (error) {
				console.error('Error fetching user context:', error);
			}
		};

		fetchUserContext();
	}, []);

	if (loading) {
		return <CircleLoader />;
	}

	return (
		<Card
			className='w-[400px] bg-slate-900 p-2'
			id='embedded-lita-chat-app-panel'
		>
			<CardContent>
				<ScrollArea className='h-[400px] w-full space-y-4 p-4 border border-indigo-500 rounded-tl-3xl rounded-br-3xl'>
					{messages.map((message, index) => {
						const isLastAssistantMessage =
							message.role === 'assistant' && index === messages.length - 1;
						return (
							<div key={message.id} className='text-slate-600 text-sm mb-4'>
								<div
									className={`flex mb-2 ${
										message.role === 'assistant'
											? 'justify-start'
											: 'justify-end mr-4'
									}`}
								>
									{message.role === 'assistant' && (
										<Avatar className={`self-start`}>
											<AvatarFallback>AS</AvatarFallback>
											<AvatarImage src='https://api.multiavatar.com/Robot.png' />
										</Avatar>
									)}

									<div
										className={`rounded-lg p-3 ${
											message.role === 'assistant'
												? 'bg-gray-700 text-white rounded-br-3xl ml-2'
												: 'bg-gray-200 text-gray-800 rounded-bl-3xl'
										}`}
										style={{ maxWidth: '70%' }}
									>
										<span className='block font-bold'>
											{message.role === 'user' ? '' : 'LITA:'}
										</span>
										{message.content}
										{message.role === 'assistant' && isLastAssistantMessage && (
											<motion.div
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ delay: 5, duration: 0.5 }}
												className='text-white mt-2'
											>
												{ASSITANT_PROMPT}
												<Button
													className='bg-green-500 hover:bg-green-600 text-white m-2'
													onClick={() => handleAnswerClick(YES_ANSWER)}
												>
													Sí
												</Button>
												<Button
													className='bg-red-500 hover:bg-red-600 text-white m-1'
													onClick={() => handleAnswerClick(NO_ANSWER)}
												>
													No
												</Button>
											</motion.div>
										)}
									</div>

									{message.role === 'user' && (
										<Avatar className='self-start ml-2'>
											<AvatarFallback>US</AvatarFallback>
											<AvatarImage src={userInfo?.photoURL} />
										</Avatar>
									)}
								</div>
							</div>
						);
					})}
				</ScrollArea>
			</CardContent>

			<CardFooter>
				<form
					className='w-full flex flex-col gap-3 flex-grow'
					onSubmit={handleSubmit}
				>
					<Button
						className='bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-1 rounded'
						type='button'
						onClick={handleLastFiveExpensesClickWithCookies} // Call the function on button click
						style={{ minWidth: '120px', fontSize: '0.7rem' }}
					>
						Analizar mis últimas cinco transacciones
					</Button>
					<Text as='p' className='text-gray-400' style={{ fontSize: '0.9rem' }}>
						<Strong>Opciones predefinidas:</Strong>
					</Text>

					<div className='flex flex-wrap gap-2 mb-2'>
						{advicesPrompts.map((option) => (
							<Button
								key={option.id}
								className='bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded'
								type='button'
								onClick={() => handleButtonClick(option.prompt)}
								style={{ minWidth: '80px', fontSize: '0.7rem' }}
							>
								{option.description}
							</Button>
						))}
					</div>

					<Input
						type='text'
						placeholder='Escribí tu consulta financiera...'
						value={input}
						onChange={handleInputChange}
						className='border border-indigo-500 rounded-lg bg-slate-900 text-white'
					/>
					<Button className='bg-indigo-700 hover:bg-indigo-600' type='submit'>
						Enviar <PaperPlaneIcon className='ml-2 text-gray-400' />
					</Button>
				</form>
			</CardFooter>
		</Card>
	);
}

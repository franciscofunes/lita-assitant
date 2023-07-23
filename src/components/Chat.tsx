'use client';

import { useChat } from 'ai/react';

import { Button } from './ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from './ui/card';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';

export interface ChatProps {}

export function Chat() {
	const { messages, input, handleInputChange, handleSubmit } = useChat({
		api: '/api/chat',
	});

	return (
		<Card className='w-[400px] bg-slate-900 p-4  '>
			<CardContent>
				<ScrollArea className='h-[600px] w-full space-y-4 p-4 border border-indigo-500 rounded-tl-3xl'>
					{messages.map((message) => {
						return (
							<>
								<div key={message.id} className='text-slate-600 text-sm mb-4  '>
									{/* {message.role === 'user' && (
										<Avatar>
											<AvatarFallback>US</AvatarFallback>
											<AvatarImage src='https://api.multiavatar.com/Satoshi Bond.png' />
										</Avatar>
									)}

									{message.role === 'assistant' && (
										<Avatar>
											<AvatarFallback>AS</AvatarFallback>
											<AvatarImage src='https://api.multiavatar.com/ Bond.png' />
										</Avatar>
									)} */}

									<div
										key={message.id}
										className={`flex mb-2 ${
											message.role === 'assistant'
												? 'justify-start'
												: 'justify-end'
										}`}
									>
										<div
											className={`rounded-lg py-2 px-4 ${
												message.role === 'assistant'
													? 'bg-gray-700 text-white rounded-br-3xl'
													: 'bg-gray-200 text-gray-800 rounded-bl-3xl'
											}`}
											style={{ maxWidth: '70%' }}
										>
											<span className='block font-bold'>
												{message.role === 'user' ? '' : 'LITA:'}
											</span>
											{message.content}
										</div>
									</div>
								</div>
							</>
						);
					})}
				</ScrollArea>
			</CardContent>
			<CardFooter>
				<form
					className='w-full flex flex-col gap-4 flex-grow'
					onSubmit={handleSubmit}
				>
					<Input
						type='text'
						placeholder='Escribí tu consulta financiera...'
						value={input}
						onChange={handleInputChange}
						className='border border-indigo-500 rounded-lg bg-slate-900 text-white'
					/>
					<Button className='bg-indigo-700 hover:bg-indigo-700' type='submit'>
						Enviar
					</Button>
				</form>
			</CardFooter>
		</Card>
	);
}

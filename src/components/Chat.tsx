'use client'

import { useChat } from 'ai/react';

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { ScrollArea } from "./ui/scroll-area";

export interface ChatProps {}

export function Chat() {
  const{ messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  })

  return (  
    <Card className="w-[400px]">
      <CardContent>
        <ScrollArea className="h-[600px] w-full space-y-4 pr-4">          
          { messages.map(message => {
            return (            
              <div key={message.id} className="flex gap-2 text-slate-600 text-sm mb-4">
                {message.role === 'user' &&(
                  <Avatar>
                    <AvatarFallback>US</AvatarFallback>
                    <AvatarImage src="https://api.multiavatar.com/Satoshi Bond.png" />
                  </Avatar>
                )}

                {message.role === 'assistant' &&(
                  <Avatar>
                    <AvatarFallback>AS</AvatarFallback>
                    <AvatarImage src="https://api.multiavatar.com/ Bond.png" />
                  </Avatar>
                )}

                <p className="landing-relaxed">
                  <span className="block font-bold text-slate-800">
                    {message.role === 'user' ? 'Usuario' : 'LITA'}:
                  </span>
                  {message.content}
                </p>
              </div> 
            )
          }) }
        </ScrollArea>
      </CardContent>
      <CardFooter >
        <form className="w-full flex gap-2" onSubmit={handleSubmit}>
          <Input type="text" placeholder="¿Cómo puedo ayudarte?" value={input} onChange={handleInputChange} />
          <Button type="submit">Enviar</Button>
        </form>
      </CardFooter>
    </Card>
  )
}
import { ChatMessage, ChatSession, Product } from '@prisma/client';

export interface ChatSessionSummary {
  id: string;
  title: string | null;
  guestName: string | null;
  customerId: string | null;
  saleId: string | null;
  isOpen: boolean;
  product: Pick<Product, 'id' | 'name' | 'imageUrl'> | null;
  lastMessage: Pick<
    ChatMessage,
    'id' | 'sender' | 'content' | 'createdAt'
  > | null;
  createdAt: Date;
  updatedAt: Date;
}

type SessionWithSummaryRelations = ChatSession & {
  product: Pick<Product, 'id' | 'name' | 'imageUrl'> | null;
  messages: Pick<ChatMessage, 'id' | 'sender' | 'content' | 'createdAt'>[];
};

export function mapSessionToSummary(
  session: SessionWithSummaryRelations,
): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    guestName: session.guestName,
    customerId: session.customerId,
    saleId: session.saleId,
    isOpen: session.isOpen,
    product: session.product,
    lastMessage: session.messages[0] ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

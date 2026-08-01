import { ChatMessage, ChatSession, Product, User } from '@prisma/client';

export interface ChatSessionCustomerSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
}

export interface ChatSessionSaleSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string | null;
  guestName: string | null;
  customerId: string | null;
  saleId: string | null;
  isOpen: boolean;
  product: Pick<Product, 'id' | 'name' | 'imageUrl'> | null;
  customer: ChatSessionCustomerSummary | null;
  sale: ChatSessionSaleSummary | null;
  lastMessage: Pick<
    ChatMessage,
    'id' | 'sender' | 'content' | 'createdAt'
  > | null;
  createdAt: Date;
  updatedAt: Date;
}

type SessionWithSummaryRelations = ChatSession & {
  product: Pick<Product, 'id' | 'name' | 'imageUrl'> | null;
  customer: Pick<User, 'id' | 'fullName' | 'email' | 'phone'> | null;
  sale?: Pick<User, 'id' | 'fullName' | 'email'> | null;
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
    customer: session.customer,
    sale: session.sale
      ? {
          id: session.sale.id,
          fullName: session.sale.fullName,
          email: session.sale.email,
        }
      : null,
    lastMessage: session.messages[0] ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

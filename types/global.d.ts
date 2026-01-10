declare global {
  var wsBroadcast: {
    toUser: (userId: string, message: any) => void;
    toTicket: (ticketId: string, message: any) => void;
  } | undefined;
}

export {};

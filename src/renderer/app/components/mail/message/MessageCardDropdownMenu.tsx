import { MonoMessage } from '@/main/models/message/MonoMessage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import LinkShareDropdownItem from '@/renderer/app/containers/dropdown/LinkShareDropdownItem';
import { DBGetThread } from '@/renderer/app/lib/db/thread';
import React, { FC, useEffect, useState } from 'react';

interface MessageCardDropdownMenuProps {
  item: MonoMessage;
  children: React.ReactNode;
  accountId?: string;
}

const MessageCardDropdownMenu: FC<MessageCardDropdownMenuProps> = ({
  children,
  accountId,
  item
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="dark" align="end">
        <LinkShareDropdownItem accountId={accountId} type={'message'} itemId={item.id} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default MessageCardDropdownMenu;

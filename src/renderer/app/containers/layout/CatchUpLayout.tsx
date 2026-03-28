import { MonoMessage } from '@/main/models/message/MonoMessage';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import CatchUpHeader from '@/renderer/app/containers/header/CatchUpHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { FC, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface CatchUpLayoutProps {}

const CatchUpLayout: FC<CatchUpLayoutProps> = () => {
  const navigate = useNavigate();
  const { member, isLoading: authLoading } = useAuth();
  const { id } = useParams();
  const [messages, setMessages] = useState<MonoMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {}, [id, member]);

  return (
    <div className="flex h-screen flex-col">
      <div className="bg-card">
        <CatchUpHeader />
      </div>
      <div className="flex flex-1 flex-col bg-card">
        <section className="flex-1">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b p-3">
              <Badge sizeVariant={'sm'}>
                <MonoIcon type={'Sparkles'} className="mr-2" /> AI Draft
              </Badge>
              <div className="text-lg font-medium">3 written while you were away</div>
            </div>
            <div className="relative flex w-full flex-1 flex-col gap-4">
              <div className={'flex h-full'}>
                <div className="flex-1 p-3"></div>
                <div className="flex-1 border-l">{/* <DisplayPanel /> */}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CatchUpLayout;

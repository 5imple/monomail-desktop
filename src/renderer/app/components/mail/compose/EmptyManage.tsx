import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';

const EmptyManage = ({
  onAddItem,
  type
}: {
  onAddItem: () => void;
  type: 'signature' | 'template';
}) => {
  return (
    <div className="flex border rounded-md p-8 flex-col items-center justify-center h-full w-full">
      <div className="bg-muted rounded-full p-4 mb-2">
        {type === 'signature' ? <MonoIcon type={'Signature'} /> : <MonoIcon type={'FileText'} />}
      </div>
      <h1 className="font-semibold">{type === 'signature' ? 'Signatures' : 'Templates'}</h1>
      <p className="text-muted-foreground mb-4">
        {type === 'signature'
          ? 'Create and manage signatures across all your devices'
          : 'Quickly reply to common emails with pre-written text'}
      </p>
      <Button variant="outline" onClick={onAddItem}>
        <MonoIcon type={'Plus'} className="mr-2" />

        {type === 'signature' ? 'Add Signature' : 'Add Template'}
      </Button>
    </div>
  );
};

export default EmptyManage;

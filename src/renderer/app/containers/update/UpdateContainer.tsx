import MonoLogo from '@/renderer/app/components/common/MonoLogo';
import { Progress } from '@/renderer/app/components/ui/progress';
import { FC, useEffect, useState } from 'react';

interface UpdateContainerProps {}

interface UpdateInfo {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}

// Helper function to format bytes to MB or GB
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

const UpdateContainer: FC<UpdateContainerProps> = ({}) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const removePercentListener = window.electronBridge.on(
      'renderer:update:info',
      (info: UpdateInfo) => {
        setUpdateInfo(info);
      }
    );
    return () => {
      removePercentListener();
    };
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="drag fixed left-0 right-0 top-0 h-8"></div>
      <div className="bg-background">
        <div className="mt-8 flex h-full flex-col items-center justify-center gap-6">
          <MonoLogo className="w-20" />
          <div className="-mt-2 text-sm font-medium">
            {updateInfo ? 'Downloading new updates' : 'Checking for updates...'}
          </div>
          <div className="flex h-12 w-64 flex-col gap-2">
            <Progress
              className="h-[2px]"
              isLoading={!updateInfo}
              value={updateInfo?.percent ?? 0}
            />
            {/* {updateInfo && (
              <div className="text-xs flex justify-between">
                <div className="text-muted-foreground">{`${formatBytes(updateInfo.transferred)} / ${formatBytes(updateInfo.total)}`}</div>
                <div>{`${formatBytes(updateInfo.bytesPerSecond)}/s`}</div>
              </div>
            )} */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateContainer;

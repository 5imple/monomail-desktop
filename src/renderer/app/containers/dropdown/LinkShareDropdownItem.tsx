import { apiClient } from '@/main/api/apiClient';
import shareApi from '@/main/api/share/shareApi';
import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { Switch } from '@/renderer/app/components/ui/switch';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { OwnerShare } from '@/renderer/app/store/shared/atoms';
import { useSharedAtom } from '@/renderer/app/store/shared/useSharedAtom';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface LinkShareDropdownItemProps {
  itemId: string;
  accountId?: string;
  type: 'thread' | 'message' | 'draft';
}

const LinkShareDropdownItem: FC<LinkShareDropdownItemProps> = ({ accountId, itemId, type }) => {
  const { t } = useTranslation();
  const [accessLevel, setAccessLevel] = useState<'WORKSPACE' | 'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { trackEvent } = useUserTrackingData();

  // Use the owner shares atom
  const { isItemShared, isLoadingForAccount, addOrUpdateShare, removeShare } = useSharedAtom();

  const handleCopyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url).then(
      () => {
        toast.success(t('toast.clipboard_copy'));
        setCopied(true);
        trackEvent('share_link_copied', { share_id: shareId, url });
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };

  const changeAccessLevel = async (newAccessLevel: 'PUBLIC' | 'PRIVATE' | 'WORKSPACE') => {
    if (!shareId || !accountId) return;
    const prevAccessLevel = accessLevel;
    setAccessLevel(newAccessLevel);
    try {
      apiClient.setApiActiveUid(accountId);
      const updatedShare = await shareApi.updateLinkShare({
        sharedEmailId: shareId,
        access: newAccessLevel,
        published: isPublished
      });

      // Convert Date to string for OwnerShare interface
      const ownerShare: OwnerShare = {
        ...updatedShare,
        createdAt:
          updatedShare.createdAt instanceof Date
            ? updatedShare.createdAt.toISOString()
            : updatedShare.createdAt,
        updatedAt:
          updatedShare.updatedAt instanceof Date
            ? updatedShare.updatedAt.toISOString()
            : updatedShare.updatedAt
      };

      // Update the atom with the new share data
      addOrUpdateShare(accountId, ownerShare);

      trackEvent('access_level_toggled', {
        share_id: shareId,
        new_access: newAccessLevel
      });
    } catch (error) {
      setAccessLevel(prevAccessLevel);
      if ((error as any).status === 403) {
        toast.error(t('toast.error.permission_required'));
      }
      console.error('Failed to update access level:', error);
    }
  };

  const changePublished = async (newPublishState: boolean) => {
    if (!accountId) return;

    try {
      // Update local state immediately for responsive UI
      setIsPublished(newPublishState);

      // If we're switching to published and don't have a shareId yet, it will be created in useEffect
      if (newPublishState && !shareId) {
        return; // Let the useEffect handle creation
      }

      // If we have an existing shareId, update it
      if (shareId) {
        apiClient.setApiActiveUid(accountId);
        const updatedShare = await shareApi.updateLinkShare({
          sharedEmailId: shareId,
          published: newPublishState,
          access: accessLevel
        });

        // Convert Date to string for OwnerShare interface
        const ownerShare: OwnerShare = {
          ...updatedShare,
          createdAt:
            updatedShare.createdAt instanceof Date
              ? updatedShare.createdAt.toISOString()
              : updatedShare.createdAt,
          updatedAt:
            updatedShare.updatedAt instanceof Date
              ? updatedShare.updatedAt.toISOString()
              : updatedShare.updatedAt
        };

        // Update the atom with the new share data
        addOrUpdateShare(accountId, ownerShare);

        trackEvent('access_publish_toggled', {
          share_id: shareId,
          new_published: newPublishState
        });
      }
    } catch (error) {
      // Revert state on error
      setIsPublished(!newPublishState);

      if ((error as any).status === 403) {
        toast.error(t('toast.error.permission_required'));
      }
      console.error('Failed to update published state:', error);
    }
  };

  // Check if item is already shared on component mount
  useEffect(() => {
    const checkExistingShare = async () => {
      if (!accountId || !itemId) return;

      try {
        // Check if the current item is shared
        const existingShare = isItemShared(accountId, itemId, type);

        if (existingShare) {
          // Item is already shared, set the share details
          setShareId(existingShare.id);
          setAccessLevel(existingShare.access);
          setIsPublished(existingShare.published);
        } else {
          // Item is not shared
          setShareId(null);
          setIsPublished(false);
        }
      } catch (error) {
        console.error('Failed to check existing shares:', error);
      }
    };

    checkExistingShare();
  }, [accountId, itemId, type, isItemShared]);

  useEffect(() => {
    const createLinkShare = async () => {
      try {
        if (!accountId) return;
        apiClient.setApiActiveUid(accountId);

        const result = await shareApi.createLinkShare({
          dataId: itemId,
          sharedDataType: type.toUpperCase() as 'MESSAGE' | 'THREAD',
          published: isPublished,
          access: accessLevel
        });

        if (result) {
          setShareId(result.id);
          setAccessLevel(result.access);
          setIsPublished(result.published);

          // Convert Date to string for OwnerShare interface
          const ownerShare: OwnerShare = {
            ...result,
            createdAt:
              result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt,
            updatedAt:
              result.updatedAt instanceof Date ? result.updatedAt.toISOString() : result.updatedAt
          };

          // Add the new share to the atom
          addOrUpdateShare(accountId, ownerShare);

          trackEvent('link_share_created', {
            share_id: result.id,
            dataId: itemId,
            sharedDataType: type.toUpperCase(),
            published: result.published,
            access: result.access
          });
        }
      } catch (error) {
        console.error('Failed to create public share:', error);
      }
    };

    // Create the link share when publishing for the first time
    if (itemId && isPublished && !shareId) {
      createLinkShare();
    }
  }, [isPublished, shareId, itemId, accountId, accessLevel, type, trackEvent, addOrUpdateShare]);

  const getShareUrl = () => {
    return `https://${import.meta.env.MONO_ENV_FIREBASE_AUTH_DOMAIN}/share/${shareId}`;
  };

  // Get current loading state and share status
  const isLoading = accountId ? isLoadingForAccount(accountId) : false;
  const currentShare = accountId ? isItemShared(accountId, itemId, type) : null;
  const isShared = !!currentShare;

  return (
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <MonoIcon
            type={'Link'}
            className={`mr-2 h-3.5 w-3.5 ${isShared ? 'text-foreground' : 'text-muted-foreground'}`}
          />
          {t('header.display.share_link')}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="dark -mt-1 min-w-36 transition-all">
            <DropdownMenuLabel>{t('dialog.link_share.title')}</DropdownMenuLabel>

            {/* Primary publish toggle */}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                changePublished(!isPublished);
              }}
              disabled={isLoading}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isPublished ? (
                    <MonoIcon type={'Globe'} className="text-primary" />
                  ) : (
                    <MonoIcon type={'Lock'} className="text-muted-foreground" />
                  )}
                  {isPublished
                    ? t('dialog.link_share.published')
                    : t('dialog.link_share.not_published')}
                </div>
                <Switch
                  checked={isPublished}
                  onCheckedChange={(checked) => changePublished(checked)}
                  className="ml-auto"
                  size={'sm'}
                  disabled={isLoading}
                />
              </div>
            </DropdownMenuItem>

            {/* Only show these options when published is enabled */}
            {isPublished && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('dialog.link_share.visible_for')}</DropdownMenuLabel>

                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  disabled
                >
                  <MonoIcon type={'Workspace'} className="mr-2 text-muted-foreground" />
                  {t('dialog.link_share.workspace')}
                  {accessLevel === 'WORKSPACE' && <MonoIcon type={'Check'} className="ml-auto" />}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    changeAccessLevel('PUBLIC');
                  }}
                >
                  <MonoIcon type={'Globe'} className="mr-2 text-muted-foreground" />
                  {t('dialog.link_share.public')}
                  {accessLevel === 'PUBLIC' && <MonoIcon type={'Check'} className="ml-auto" />}
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    changeAccessLevel('PRIVATE');
                  }}
                >
                  <MonoIcon type={'Lock'} className="mr-2 text-muted-foreground" />
                  {t('dialog.link_share.private')}
                  {accessLevel === 'PRIVATE' && <MonoIcon type={'Check'} className="ml-auto" />}
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (shareId) handleCopyToClipboard(getShareUrl());
                  }}
                >
                  <MonoIcon type={'Copy'} className="mr-2 text-muted-foreground" />
                  {t('dialog.link_share.copy_link')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
};

export default LinkShareDropdownItem;

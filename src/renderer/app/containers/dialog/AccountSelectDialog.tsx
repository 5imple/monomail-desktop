import { MonoAccount, MonoMember } from '@/main/api/auth/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/renderer/app/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/renderer/app/components/ui/avatar';
import { Button } from '@/renderer/app/components/ui/button';

import {
  List,
  ListContent,
  ListDescription,
  ListHeader,
  ListTitle
} from '@/renderer/app/components/ui/list';
import { Separator } from '@/renderer/app/components/ui/separator';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { getSupportEmail } from '@/renderer/app/lib/runtimeBranding';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface AccountSelectDialogProps {
  children?: React.ReactNode;
  relatedMembers: Array<MonoMember>;
  accounts: Array<MonoAccount>;
  member: MonoMember | null;
  open: boolean;
  onSignIn: () => void;
  onCreateAccount: () => void;
}

const AccountSelectDialog: FC<AccountSelectDialogProps> = ({
  member,
  accounts,
  relatedMembers,
  children,
  open,
  onSignIn,
  onCreateAccount
  // onOpenChange
}) => {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogPortal>
        {/* <DialogOverlay className="dark" /> */}
        <AlertDialogContent className="sm:max-w-[600px]">
          <AlertDialogTitle>{t('dialog.account_select.title')}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            <span className="font-medium">{accounts[0]?.email}</span>{' '}
            {t('dialog.account_select.description')}
          </AlertDialogDescription>
          <Separator className="mt-4" />
          <div className="-mx-4">
            <div className="flex flex-col gap-3">
              {relatedMembers.map((member, index) => {
                return (
                  <a
                    key={member.email}
                    href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=${isElectron ? 'web-electron' : 'web'}}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <List>
                      <ListHeader className="">
                        {/* <div className="w-10 h-10 flex items-center justify-center">
                          <img src={googleIcon} className="w-5 h-5" />
                        </div> */}
                        <Avatar className="h-10 w-10 border">
                          <AvatarImage src={member.profileImageUrl} />
                          <AvatarFallback>{member.displayName.slice(0, 1)}</AvatarFallback>
                        </Avatar>
                      </ListHeader>
                      <ListContent>
                        <ListTitle>
                          {member.displayName}{' '}
                          <span className="text-muted-foreground">@{member.memberName}</span>
                        </ListTitle>
                        <ListDescription>{`${member.email} (${t('dialog.account_select.requires_sign_in')})`}</ListDescription>
                      </ListContent>
                    </List>
                  </a>
                );
              })}
              {member ? (
                <a onClick={onSignIn}>
                  <List>
                    <ListHeader className="">
                      <Avatar className="h-10 w-10 border">
                        <AvatarImage src={member.profileImageUrl} />
                        <AvatarFallback>{member.displayName.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                    </ListHeader>

                    <ListContent>
                      <ListTitle>{`${member.displayName}`}</ListTitle>
                      <ListDescription>{`${member.email}`}</ListDescription>
                    </ListContent>
                  </List>
                </a>
              ) : (
                accounts.length > 0 && (
                  <a onClick={onCreateAccount}>
                    <List>
                      <ListHeader className="">
                        <Avatar className="h-10 w-10 border">
                          <AvatarFallback>
                            {<MonoIcon type={'UserIcon'} className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                      </ListHeader>

                      <ListContent>
                        <ListTitle>{t('dialog.account_select.create_new')}</ListTitle>
                        <ListDescription>{accounts[0].email}</ListDescription>
                      </ListContent>
                    </List>
                  </a>
                )
              )}
            </div>
          </div>

          <AlertDialogFooter className="text-sm text-muted-foreground sm:justify-start">
            {t('dialog.account_select.trouble_signing_in')}
            <Button className="ml-1" variant={'link'} typeVariant={'inline'} asChild>
              <a href={`mailto:${getSupportEmail()}`} target="_blank" rel="noreferrer">
                {getSupportEmail()}
              </a>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};

export default AccountSelectDialog;

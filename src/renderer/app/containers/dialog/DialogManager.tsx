import CommandPalette from '@/renderer/app/containers/command/CommandPalette';
import DraftDiscardDialog from '@/renderer/app/containers/dialog/DraftDiscardDialog';
import DraftSaveDialog from '@/renderer/app/containers/dialog/DraftSaveDialog';
import ReleaseNoteDialog from '@/renderer/app/containers/dialog/ReleaseNoteDialog';
import SendFeedbackDialog from '@/renderer/app/containers/dialog/SendFeedbackDialog';
import ShortcutsDialog from '@/renderer/app/containers/dialog/ShortcutsDialog';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useReleaseNotesAtom } from '@/renderer/app/store/layout/useReleaseNotesAtom';
import { lazy, Suspense, useEffect, useState } from 'react';

// Loaded the first time they open, not with the app: the attachment preview
// carries the PDF viewer (react-pdf) and Settings every settings page. Once
// open they stay mounted, so closing animates as before.
const AttachmentPreviewDialog = lazy(
  () => import('@/renderer/app/containers/dialog/AttachmentPreviewDialog')
);
const PreferanceDialog = lazy(() => import('@/renderer/app/containers/dialog/PreferanceDialog'));

/** True from the first time `open` is true. */
const useOpenedOnce = (open: boolean) => {
  const [opened, setOpened] = useState(open);
  useEffect(() => {
    if (open) setOpened(true);
  }, [open]);
  return opened || open;
};

const DialogManager = () => {
  const { dialogState, setDialogState, closeDialog } = useDialogs();
  const attachmentPreviewOpened = useOpenedOnce(dialogState.attachmentPreview.open);
  const preferenceOpened = useOpenedOnce(dialogState.preference.open);
  const { isLoaded, initVisibleReleaseNote, fetchReleaseNotes } = useReleaseNotesAtom();

  // Release notes are fetched a few seconds after launch, not during it: the
  // request went out with the first inbox and body loads.
  useEffect(() => {
    if (isLoaded) {
      initVisibleReleaseNote();
      return;
    }
    const timer = setTimeout(() => fetchReleaseNotes(), 5000);
    return () => clearTimeout(timer);
  }, [isLoaded]);
  return (
    <>
      <ShortcutsDialog
        open={dialogState.shortcuts.open}
        onOpenChange={(open) => {
          if (!open) closeDialog('shortcuts');
        }}
      />
      <DraftDiscardDialog
        open={dialogState.discardDraft.open}
        onOpenChange={() => {
          closeDialog('discardDraft');
        }}
        onSave={dialogState.discardDraft.onSave}
        onDiscard={dialogState.discardDraft.onDiscard}
      />
      <DraftSaveDialog
        open={dialogState.saveDraft.open}
        onOpenChange={() => {
          closeDialog('saveDraft');
        }}
        isNewDraft={dialogState.saveDraft.isNewDraft}
        onSave={dialogState.saveDraft.onSave}
        onDiscard={dialogState.saveDraft.onDiscard}
      />
      <ReleaseNoteDialog
        open={dialogState.releaseNote.open}
        onOpenChange={() => {
          closeDialog('releaseNote');
        }}
        releaseNote={dialogState.releaseNote.releaseNote}
      />
      <SendFeedbackDialog
        open={dialogState.feedback.open}
        onOpenChange={() => closeDialog('feedback')}
      />
      {preferenceOpened && (
        <Suspense fallback={null}>
          <PreferanceDialog
            open={dialogState.preference.open}
            defaultPage={dialogState.preference.defaultPage} // Pass additional prop
            onOpenChange={() => closeDialog('preference')}
          />
        </Suspense>
      )}
      {attachmentPreviewOpened && (
        <Suspense fallback={null}>
          <AttachmentPreviewDialog
            accountId={dialogState.attachmentPreview.accountId}
            attachment={dialogState.attachmentPreview.attachment}
            itemId={dialogState.attachmentPreview.itemId}
            source={dialogState.attachmentPreview.source}
            open={dialogState.attachmentPreview.open}
            onOpenChange={() => {
              closeDialog('attachmentPreview');
            }}
          />
        </Suspense>
      )}
      <CommandPalette
        searchQuery={dialogState.commandPalette.searchQuery}
        selectedAccountId={dialogState.commandPalette.selectedAccountId}
        selectedSpaceId={dialogState.commandPalette.selectedSpaceId}
        bookmarkName={dialogState.commandPalette.bookmarkName}
        bookmarkIcon={dialogState.commandPalette.bookmarkIcon}
        pages={dialogState.commandPalette.pages}
        pinContact={dialogState.commandPalette.pinContact}
        setPages={(values) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, pages: values }
          }));
        }}
        open={dialogState.commandPalette.open}
        onOpenChange={() => {
          closeDialog('commandPalette');
        }}
        setSearchQuery={(query) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, searchQuery: query }
          }));
        }}
        setBookmarkName={(name) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, bookmarkName: name }
          }));
        }}
        setBookmarkIcon={(icon) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, bookmarkIcon: icon }
          }));
        }}
        setPinContact={(contact) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, pinContact: contact }
          }));
        }}
        setSelectedAccountId={(values) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, selectedAccountId: values }
          }));
        }}
        setSelectedSpaceId={(values) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, selectedSpaceId: values }
          }));
        }}
      />
    </>
  );
};

export default DialogManager;

import CommandPalette from '@/renderer/app/containers/command/CommandPalette';
import AttachmentPreviewDialog from '@/renderer/app/containers/dialog/AttachmentPreviewDialog';
import DeleteMemberDialog from '@/renderer/app/containers/dialog/DeleteMemberDialog';
import DraftDiscardDialog from '@/renderer/app/containers/dialog/DraftDiscardDialog';
import DraftSaveDialog from '@/renderer/app/containers/dialog/DraftSaveDialog';
import PreferanceDialog from '@/renderer/app/containers/dialog/PreferanceDialog';
import ReleaseNoteDialog from '@/renderer/app/containers/dialog/ReleaseNoteDialog';
import SendFeedbackDialog from '@/renderer/app/containers/dialog/SendFeedbackDialog';
import { NPSDialog } from '@/renderer/app/containers/dialog/NPSDialog';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useReleaseNotesAtom } from '@/renderer/app/store/layout/useReleaseNotesAtom';
import { useEffect } from 'react';

const DialogManager = () => {
  const { dialogState, setDialogState, closeDialog } = useDialogs();
  const { isLoaded, initVisibleReleaseNote, fetchReleaseNotes, showNextReleaseNote } =
    useReleaseNotesAtom();

  useEffect(() => {
    if (isLoaded) {
      initVisibleReleaseNote();
    } else {
      fetchReleaseNotes();
    }
  }, [isLoaded]);
  return (
    <>
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
      <PreferanceDialog
        open={dialogState.preference.open}
        defaultPage={dialogState.preference.defaultPage} // Pass additional prop
        onOpenChange={() => closeDialog('preference')}
      />
      <DeleteMemberDialog
        open={dialogState.deleteAccount.open}
        onOpenChange={() => closeDialog('deleteAccount')}
      />
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
      <CommandPalette
        searchQuery={dialogState.commandPalette.searchQuery}
        selectedAccountId={dialogState.commandPalette.selectedAccountId}
        selectedSpaceId={dialogState.commandPalette.selectedSpaceId}
        bookmarkName={dialogState.commandPalette.bookmarkName}
        bookmarkIcon={dialogState.commandPalette.bookmarkIcon}
        pages={dialogState.commandPalette.pages}
        pinContact={dialogState.commandPalette.pinContact}
        aiSearchMode={dialogState.commandPalette.aiSearchMode || false}
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
        setAiSearchMode={(mode) => {
          setDialogState((prevState) => ({
            ...prevState,
            commandPalette: { ...prevState.commandPalette, aiSearchMode: mode }
          }));
        }}
      />
      <NPSDialog
        open={dialogState.nps.open}
        onOpenChange={() => closeDialog('nps')}
        eventType={dialogState.nps.eventType}
      />
    </>
  );
};

export default DialogManager;

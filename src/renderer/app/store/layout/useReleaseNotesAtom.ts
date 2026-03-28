import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback } from 'react';

// Simplified ReleaseNote interface with only the essential properties
export interface ReleaseNote {
  uid: string;
  title: string;
  version: string;
  date: string;
  content: string;
}

// Stores an array of seen release note UIDs in local storage (empty array as default)
const seenReleaseNoteUIDsAtom = atomWithStorage<string[]>(
  'global:release:notes',
  [],
  createIndexedDBStorage<string[]>({
    defaultValue: []
  })
);

// Main atoms for release note state
const releaseNotesAtom = atom<ReleaseNote[]>([]);
const currentReleaseNoteAtom = atom<ReleaseNote | null>(null);
const isReleaseNotesLoadedAtom = atom<boolean>(false);
const isReleaseNoteVisibleAtom = atom<boolean>(false);

export function useReleaseNotesAtom() {
  const { openDialog, closeDialog } = useDialogs();
  const [releaseNotes, setReleaseNotes] = useAtom(releaseNotesAtom);
  const [currentReleaseNote, setCurrentReleaseNote] = useAtom(currentReleaseNoteAtom);
  const [isLoaded, setIsLoaded] = useAtom(isReleaseNotesLoadedAtom);
  const [seenUIDs, setSeenUIDs] = useAtom(seenReleaseNoteUIDsAtom);
  const [isReleaseNoteVisible, setIsReleaseNoteVisible] = useAtom(isReleaseNoteVisibleAtom);

  // Fetch the latest release notes from the API
  const fetchReleaseNotes = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/api/release-note?version=${import.meta.env.MONO_ENV_APP_VERSION.split('-')[0]}`
      );
      if (!response.ok) throw new Error('Failed to fetch release notes');
      const data: ReleaseNote[] = await response.json();

      // Handle both array and single object response formats
      const notesArray = Array.isArray(data) ? data : [data];

      // Map the API response to our simplified ReleaseNote interface
      const releaseNotes: ReleaseNote[] = notesArray.map((note) => ({
        uid: note.uid,
        title: note.title || '',
        version: note.version,
        date: note.date || new Date().toISOString(), // Fallback if date is not provided
        content: note.content || ''
      }));

      // Sort by date in descending order (newest first)
      releaseNotes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setReleaseNotes(releaseNotes);
    } catch (error) {
      console.error('Error fetching release notes:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const initVisibleReleaseNote = () => {
    const unseenNote = releaseNotes.find((note) => !seenUIDs.includes(note.uid));
    const currentNote = unseenNote || releaseNotes[0];

    setCurrentReleaseNote(currentNote);

    if (unseenNote) {
      openDialog('releaseNote');
    }
    // Only show the modal if there's an unseen note
    setIsReleaseNoteVisible(!!unseenNote);
  };

  // Mark the current release note as seen and update local storage
  const markModalAsSeen = () => {
    if (currentReleaseNote?.uid) {
      // Add the current UID to the array of seen UIDs if not already present
      if (!seenUIDs.includes(currentReleaseNote.uid)) {
        setSeenUIDs([...seenUIDs, currentReleaseNote.uid]);
      }
    }
  };

  // Navigate to next release note, prioritizing unseen ones
  const showNextReleaseNote = useCallback(() => {
    if (!releaseNotes.length) return;

    // Find current index
    const currentIndex = releaseNotes.findIndex((note) => note.uid === currentReleaseNote?.uid);

    if (currentIndex === -1 || currentIndex === 0) {
      // If at the end or not found, close the modal
      setIsReleaseNoteVisible(false);
      closeDialog('releaseNote');
      return;
    }

    // Show next note
    const nextNote = releaseNotes[currentIndex - 1];
    setCurrentReleaseNote(nextNote);
  }, [releaseNotes, currentReleaseNote]);

  const showPreviousReleaseNote = useCallback(() => {
    if (!releaseNotes.length) return;

    // Find current index
    const currentIndex = releaseNotes.findIndex((note) => note.uid === currentReleaseNote?.uid);

    if (currentIndex === -1 || currentIndex === releaseNotes.length - 1) {
      // If at the beginning or not found, close the modal
      setIsReleaseNoteVisible(false);
      closeDialog('releaseNote');
      return;
    }

    // Show previous note
    const prevNote = releaseNotes[currentIndex + 1];
    setCurrentReleaseNote(prevNote);
  }, [releaseNotes, currentReleaseNote]);
  // Helper function to show a specific release note by UID
  const showReleaseNoteByUID = (uid: string) => {
    const note = releaseNotes.find((note) => note.uid === uid);
    if (note) {
      setCurrentReleaseNote(note);
      setIsReleaseNoteVisible(true);
      openDialog('releaseNote');
    }
  };

  // Helper function to reset seen status (for testing purposes)
  const resetSeenStatus = () => {
    setSeenUIDs([]);
  };

  return {
    fetchReleaseNotes,
    initVisibleReleaseNote,
    isReleaseNoteVisible,
    currentReleaseNote,
    releaseNotes,
    isLoaded,
    markModalAsSeen,
    showNextReleaseNote,
    showReleaseNoteByUID,
    seenUIDs,
    resetSeenStatus,
    setCurrentReleaseNote
  };
}

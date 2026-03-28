import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoAttachment } from '@/main/models/types';
import { NPSEventType } from '@/renderer/app/store/account/useNPSAtom';
import { ReleaseNote } from '@/renderer/app/store/layout/useReleaseNotesAtom';
import { atom } from 'jotai';

export interface DialogState {
  confirm: {
    open: boolean;
    title?: React.ReactNode;
    content?: React.ReactNode;
    footer?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  };
  discardDraft: {
    open: boolean;
    onDiscard?: () => void;
    onSave?: () => void;
  };
  saveDraft: {
    open: boolean;
    onDiscard?: () => void;
    onSave?: () => void;
  };
  releaseNote: {
    open: boolean;
    releaseNote?: ReleaseNote;
    onShowNext?: () => void;
    onShowPrevious?: () => void;
  };
  feedback: {
    open: boolean;
  };
  compose: {
    open: boolean;
    draft?: MonoDraft;
  };
  preference: {
    open: boolean;
    defaultPage: string;
  };
  deleteAccount: {
    open: boolean;
  };
  accountSelect: {
    open: boolean;
  };
  searchBookmark: {
    open: boolean;
  };
  attachmentPreview: {
    accountId: string;
    open: boolean;
    itemId: string;
    source: 'message' | 'draft';
    attachment?: MonoAttachment;
  };
  commandPalette: {
    open: boolean;
    pages: string[];
    searchQuery: string;
    bookmarkName: string;
    bookmarkIcon: string;
    pinContact: string;
    selectedAccountId: string; // Added this field for multi-account support
    selectedSpaceId?: string; // Added this field for space context
    aiSearchMode?: boolean; // Added this field for AI search mode
  };
  pinContact: {
    open: boolean;
  };
  nps: {
    open: boolean;
    eventType: NPSEventType;
  };
}

export const dialogStateAtom = atom<DialogState>({
  confirm: {
    open: false
  },
  discardDraft: {
    open: false
  },
  saveDraft: {
    open: false
  },
  releaseNote: {
    open: false
  },
  feedback: {
    open: false
  },
  compose: {
    open: false
  },
  preference: {
    open: false,
    defaultPage: 'general'
  },
  deleteAccount: {
    open: false
  },
  accountSelect: {
    open: false
  },
  searchBookmark: {
    open: false
  },
  attachmentPreview: {
    open: false,
    itemId: '',
    accountId: '',
    source: 'message'
  },
  commandPalette: {
    open: false,
    pages: [],
    searchQuery: '',
    bookmarkName: '',
    bookmarkIcon: '',
    pinContact: '',
    selectedAccountId: '', // Initialize with empty string
    selectedSpaceId: undefined, // Initialize with undefined
    aiSearchMode: false // Initialize AI search mode as false
  },
  pinContact: {
    open: false
  },
  nps: {
    open: false,
    eventType: 'general_feedback'
  }
});

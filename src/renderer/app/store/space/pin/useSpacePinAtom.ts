import spaceApi from '@/main/api/space/spaceApi';
import { AddPinRequest } from '@/main/api/space/types';
import { DBGetContactByEmail, DBUpdateContactPinStatus } from '@/renderer/app/lib/db/contact';
import { activeSpaceAtom, spacesAtom } from '@/renderer/app/store/space/atom';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function useSpacePinAtom() {
  const [spaces, setSpaces] = useAtom(spacesAtom);
  const [activeSpace, setActiveSpace] = useAtom(activeSpaceAtom);
  const { t } = useTranslation();

  // Fetch pins for a space
  const fetchSpacePins = useCallback(
    async (id: string) => {
      try {
        const pinsResponse = await spaceApi.fetchSpacePins(id);

        if (!pinsResponse) {
          throw new Error('Invalid pins response');
        }

        // Update the space with pins
        setSpaces((prevSpaces) =>
          prevSpaces.map((space) =>
            space.id === id
              ? {
                  ...space,
                  pinnedEmails: pinsResponse.pinnedEmails
                }
              : space
          )
        );

        // Update active space if needed
        if (activeSpace && activeSpace.id === id) {
          setActiveSpace((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              pinnedEmails: pinsResponse.pinnedEmails
            };
          });
        }

        // Update contact pin status in DB for each pinned email
        if (pinsResponse.pinnedEmails && pinsResponse.pinnedEmails.length > 0) {
          await updateContactsPinStatusInDB(id, pinsResponse.pinnedEmails, true);
        }

        return pinsResponse.pinnedEmails;
      } catch (error) {
        console.error('Failed to fetch pins for space:', error);
        throw error;
      }
    },
    [activeSpace, setSpaces, setActiveSpace]
  );

  // Helper function to update contact pin status in the database
  const updateContactsPinStatusInDB = async (
    spaceId: string,
    emails: string[],
    isPinned: boolean
  ) => {
    try {
      for (const email of emails) {
        // Get contact by email
        const contacts = await DBGetContactByEmail(spaceId, email);

        if (contacts && contacts.length > 0) {
          // Update each matching contact's pin status
          // for (const contact of contacts) {
          //   await DBUpdateContactPinStatus(
          //     spaceId,
          //     contact.contactId,
          //     isPinned,
          //     isPinned ? (contact.pinOrder ?? emails.indexOf(email)) : undefined
          //   );
          // }
        }
      }
    } catch (error) {
      console.error('Failed to update contact pin status in DB:', error);
    }
  };

  // Pin an email in the current active space
  const pinEmailInSpace = useCallback(
    async (email: string) => {
      if (!activeSpace) return;

      // Don't add if already pinned
      if (activeSpace.pinnedEmails?.includes(email)) {
        return;
      }

      // Create updated pins list
      const updatedPinnedEmails = [...(activeSpace.pinnedEmails || []), email];

      // Save original state for rollback
      const originalActiveSpace = { ...activeSpace };
      const originalSpaces = [...spaces];

      try {
        // 1. Optimistically update UI first
        // Update active space
        setActiveSpace({
          ...activeSpace,
          pinnedEmails: updatedPinnedEmails
        });

        // Update in space collection
        setSpaces((prevSpaces) =>
          prevSpaces.map((space) =>
            space.id === activeSpace.id ? { ...space, pinnedEmails: updatedPinnedEmails } : space
          )
        );

        // 2. Then make the API call
        const pinRequest: AddPinRequest = {
          pinnedEmail: email
        };

        await spaceApi.addPinToSpace(activeSpace.id, pinRequest);

        // 3. Update contact pin status in DB
        // await updateContactsPinStatusInDB(activeSpace.id, [email], true);
      } catch (error) {
        console.error('Failed to pin email:', error);

        // Rollback to original state on error
        setActiveSpace(originalActiveSpace);
        setSpaces(originalSpaces);

        toast.error(t('toast.error.space_pin'));
        throw error;
      }
    },
    [activeSpace, setActiveSpace, spaces, setSpaces, t]
  );

  const pinMultipleEmailsInSpace = useCallback(
    async (emails: string[]) => {
      if (!activeSpace) return;

      // Filter out emails that are already pinned
      const emailsToPin = emails.filter((email) => !activeSpace.pinnedEmails?.includes(email));

      if (emailsToPin.length === 0) return;

      // Create updated pins list
      const updatedPinnedEmails = [...(activeSpace.pinnedEmails || []), ...emailsToPin];

      // Save original state for rollback
      const originalActiveSpace = { ...activeSpace };
      const originalSpaces = [...spaces];

      try {
        // 1. Optimistically update UI first
        // Update active space
        setActiveSpace({
          ...activeSpace,
          pinnedEmails: updatedPinnedEmails
        });

        // Update in space collection
        setSpaces((prevSpaces) =>
          prevSpaces.map((space) =>
            space.id === activeSpace.id ? { ...space, pinnedEmails: updatedPinnedEmails } : space
          )
        );

        // 2. Then make the API calls (sequentially)

        for await (const email of emailsToPin) {
          const pinRequest: AddPinRequest = {
            pinnedEmail: email
          };
          await spaceApi.addPinToSpace(activeSpace.id, pinRequest);
        }

        // 3. Update contact pin status in DB for all newly pinned emails
        await updateContactsPinStatusInDB(activeSpace.id, emailsToPin, true);
      } catch (error) {
        console.error('Failed to pin multiple emails:', error);

        // Rollback to original state on error
        setActiveSpace(originalActiveSpace);
        setSpaces(originalSpaces);

        toast.error(t('toast.error.space_pin'));
        throw error;
      }
    },
    [activeSpace, setActiveSpace, spaces, setSpaces, t]
  );

  // Unpin an email from the current active space with optimistic updates
  const unpinEmailFromSpace = useCallback(
    async (email: string) => {
      if (!activeSpace || !activeSpace.pinnedEmails) return;

      // Calculate updated pins list
      const updatedPinnedEmails = activeSpace.pinnedEmails.filter((e) => e !== email);

      // Save original state for rollback
      const originalActiveSpace = { ...activeSpace };
      const originalSpaces = [...spaces];

      try {
        // 1. Optimistically update UI first
        // Update active space
        setActiveSpace({
          ...activeSpace,
          pinnedEmails: updatedPinnedEmails
        });

        // Update in space collection
        setSpaces((prevSpaces) =>
          prevSpaces.map((space) =>
            space.id === activeSpace.id ? { ...space, pinnedEmails: updatedPinnedEmails } : space
          )
        );

        // 2. Then make the API call
        await spaceApi.removePinFromSpace(activeSpace.id, email);

        // 3. Update contact pin status in DB
        await updateContactsPinStatusInDB(activeSpace.id, [email], false);
      } catch (error) {
        console.error('Failed to unpin email:', error);

        // Rollback to original state on error
        setActiveSpace(originalActiveSpace);
        setSpaces(originalSpaces);

        toast.error(t('toast.error.space_unpin'));
        throw error;
      }
    },
    [activeSpace, setActiveSpace, spaces, setSpaces, t]
  );

  // Update the order of pinned emails in the current space with optimistic updates
  const reorderPinnedEmails = useCallback(
    async (newOrderedEmails: string[]) => {
      if (!activeSpace) return;

      // Save original state for rollback
      const originalActiveSpace = { ...activeSpace };
      const originalSpaces = [...spaces];

      try {
        // 1. Optimistically update UI first
        // Update active space
        setActiveSpace({
          ...activeSpace,
          pinnedEmails: newOrderedEmails
        });

        // Update in space collection
        setSpaces((prevSpaces) =>
          prevSpaces.map((space) =>
            space.id === activeSpace.id ? { ...space, pinnedEmails: newOrderedEmails } : space
          )
        );

        // 2. Then make the API call
        await spaceApi.updatePinOrder(activeSpace.id, newOrderedEmails);

        // 3. Update pinOrder in DB for each email
        // TODO
        // This needs to update each contact's pinOrder based on its position in the newOrderedEmails array
        // for (let i = 0; i < newOrderedEmails.length; i++) {
        //   const email = newOrderedEmails[i];
        //   const contacts = await DBGetContactByEmail(activeSpace.id, email);

        //   if (contacts && contacts.length > 0) {
        //     for (const contact of contacts) {
        //       await DBUpdateContactPinStatus(activeSpace.id, contact.contactId, true, i);
        //     }
        //   }
        // }
      } catch (error) {
        console.error('Failed to reorder pins:', error);

        // Rollback to original state on error
        setActiveSpace(originalActiveSpace);
        setSpaces(originalSpaces);

        toast.error(t('toast.error.space_reorder'));
        throw error;
      }
    },
    [activeSpace, setActiveSpace, spaces, setSpaces, t]
  );

  return {
    fetchSpacePins,
    pinEmailInSpace,
    pinMultipleEmailsInSpace,
    unpinEmailFromSpace,
    reorderPinnedEmails
  };
}

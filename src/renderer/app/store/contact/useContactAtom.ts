import { apiClient } from '@/main/api/apiClient';
import { MonoAccount, MonoMember } from '@/main/api/auth/types';
import contactApi from '@/main/api/contact/contactApi';
import spaceApi from '@/main/api/space/spaceApi';
import { Contact, DBCreateContact, DBGetContacts } from '@/renderer/app/lib/db/contact';
import {
  contactArrayAtom,
  lastGoogleContactSyncDateAtom,
  selectedContactAtoms
} from '@/renderer/app/store/contact/atoms';
import { format } from 'date-fns';
import { useAtom } from 'jotai';

export function useContactAtom() {
  const [contactArray, setContactArray] = useAtom(contactArrayAtom);
  const [selectedContacts, setSelectedContacts] = useAtom(selectedContactAtoms);
  const [lastSyncDates, setLastSyncDates] = useAtom(lastGoogleContactSyncDateAtom);

  /**
   * Get pinned contacts based on an array of contact IDs
   * @param pinnedContactIds Array of pinned contact IDs in order
   * @returns Array of pinned contacts in the specified order
   */
  const getContactsByIds = (pinnedContactIds: string[] = []) => {
    return contactArray
      .filter((contact) => pinnedContactIds.includes(contact.contactId))
      .sort((a, b) => {
        const aIndex = pinnedContactIds.indexOf(a.contactId);
        const bIndex = pinnedContactIds.indexOf(b.contactId);
        return aIndex - bIndex;
      });
  };

  /**
   * Get contacts by their email addresses
   * @param emails Array of email addresses
   * @returns Array of contacts in the specified order
   */
  const getContactsByEmails = (emails: string[] = []) => {
    return contactArray
      .filter((contact) => emails.includes(contact.emailAddress))
      .sort((a, b) => {
        const aIndex = emails.indexOf(a.emailAddress);
        const bIndex = emails.indexOf(b.emailAddress);
        return aIndex - bIndex;
      });
  };

  /**
   * Initialize contacts for multiple accounts from local database
   * This is used for initial app loading before space is selected
   */
  async function initializeContacts(accounts: MonoAccount[], callApi = true) {
    if (callApi) await fetchAllAccountContacts(accounts);

    try {
      // Load contacts from IndexedDB for all accounts
      const contactsArrays = await Promise.all(
        accounts.map((account) => DBGetContacts(account.uid))
      );

      // Create a map to store unique contacts by email address
      const uniqueContactsMap = new Map();

      // Process contacts from each account
      contactsArrays.forEach((contacts) => {
        // Add to unique contacts map, potentially overwriting duplicates
        contacts.forEach((contact) => {
          uniqueContactsMap.set(contact.emailAddress, contact);
        });
      });

      // Convert map values to array
      const allUniqueContacts = Array.from(uniqueContactsMap.values());

      // Update contacts in the global state
      setContactArray(allUniqueContacts);
    } catch (error) {
      console.error('Failed to initialize contacts from accounts:', error);
      setContactArray([]);
    }
  }

  /**
   * Fetch contacts for a specific space from the API
   * This replaces the previous account-based contacts fetch approach
   * @param id ID of the space to fetch contacts for
   */
  async function fetchContactsForSpace(id: string) {
    if (!id) return;

    try {
      // Fetch contacts for the space from the space contacts endpoint
      const response = await spaceApi.fetchSpaceContacts(id);

      if (response && response.contacts) {
        // Update contacts in the global state
        setContactArray(response.contacts);

        // Store contacts locally in IndexedDB for future reference
        // Using id as the owner ID to associate the contacts with the space
        await Promise.all(response.contacts.map((contact) => DBCreateContact(id, contact)));
      }
    } catch (error) {
      console.error('Failed to fetch contacts for space:', error);
    }
  }

  /**
   * Store contacts in local database
   * This is used to persist contacts fetched from space API
   */
  async function storeContactsLocally(accountId: string, contacts: Contact[]) {
    try {
      // Store contacts in IndexedDB
      await Promise.all(contacts.map((contact) => DBCreateContact(accountId, contact)));
    } catch (error) {
      console.error('Failed to store contacts locally:', error);
    }
  }

  /**
   * Handle contact selection, with support for multi-select using shift key
   */
  const selectContact = (contact: Contact, shiftKeyPressed: boolean) => {
    setSelectedContacts((prevSelected) => {
      const alreadySelected = prevSelected.some((c) => c.contactId === contact.contactId);
      if (shiftKeyPressed) {
        return alreadySelected
          ? prevSelected.filter((c) => c.contactId !== contact.contactId)
          : [...prevSelected, contact];
      }
      return [contact];
    });
  };

  /**
   * Fetch contacts from all available spaces and combine them
   * @param spaces Array of MonoSpace objects
   * @returns Combined array of unique contacts from all spaces
   */
  async function fetchContactsFromAllSpaces(spaces) {
    if (!spaces || spaces.length === 0) return [];

    try {
      // Create an array of promises to fetch contacts for each space
      const contactPromises = spaces.map((space) =>
        spaceApi.fetchSpaceContacts(space.id).catch((error) => {
          console.error(`Failed to fetch contacts for space ${space.id}:`, error);
          return { contacts: [] }; // Return empty contacts on error
        })
      );

      // Wait for all promises to resolve
      const spaceContactResponses = await Promise.all(contactPromises);

      // Create a map to store unique contacts by email address
      const uniqueContactsMap = new Map();

      // Process each space's contacts
      spaceContactResponses.forEach((response, index) => {
        if (response && response.contacts) {
          const spaceId = spaces[index].id;

          // Store contacts locally for each space
          storeContactsLocally(spaceId, response.contacts).catch((error) => {
            console.error(`Failed to store contacts for space ${spaceId}:`, error);
          });

          // Add to unique contacts map, potentially overwriting duplicates
          // You could implement more sophisticated merging logic here if needed
          response.contacts.forEach((contact) => {
            uniqueContactsMap.set(contact.emailAddress, contact);
          });
        }
      });

      // Convert map values to array
      const allUniqueContacts = Array.from(uniqueContactsMap.values());

      // Update contacts in the global state
      setContactArray(allUniqueContacts);

      return allUniqueContacts;
    } catch (error) {
      console.error('Failed to fetch contacts from all spaces:', error);
      return [];
    }
  }

  /**
   * Fetch all contacts from multiple accounts
   * This uses the contactApi.getMonoContactList for each account and combines the results
   * @param accounts Array of MonoAccount objects
   * @param storeLocally Whether to store the fetched contacts in IndexedDB
   * @returns Array of unique contacts from all accounts
   */
  async function fetchAllAccountContacts(accounts: MonoAccount[], storeLocally = true) {
    try {
      // Create a map to store unique contacts by email address
      // const uniqueContactsMap = new Map();

      // Process each account sequentially
      for (const account of accounts) {
        try {
          // Fetch contacts for the account
          apiClient.setApiActiveUid(account.uid);
          const response = await contactApi.getMonoContactList();

          if (response && response.contacts) {
            // Store contacts locally if requested
            if (storeLocally) {
              await storeContactsLocally(account.uid, response.contacts);
            }

            // Add to unique contacts map, potentially overwriting duplicates
            // response.contacts.forEach((contact) => {
            //   uniqueContactsMap.set(contact.emailAddress, contact);
            // });
          }
        } catch (error) {
          console.error(`Failed to fetch contacts for account ${account.uid}:`, error);
          // Continue with other accounts even if one fails
        }
      }

      // Convert map values to array
      // const allUniqueContacts = Array.from(uniqueContactsMap.values());

      // Update contacts in the global state
      // setContactArray(allUniqueContacts);

      // return allUniqueContacts;
    } catch (error) {
      console.error('Failed to fetch contacts from all accounts:', error);
    }
  }

  return {
    contactArray,
    getContactsByEmails,
    setContactArray,
    getContactsByIds,
    selectedContacts,
    setSelectedContacts,
    initializeContacts,
    fetchContactsForSpace,
    fetchAllAccountContacts,
    fetchContactsFromAllSpaces,
    storeContactsLocally,
    selectContact
  };
}

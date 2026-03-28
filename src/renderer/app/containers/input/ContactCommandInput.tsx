import { useState, useEffect, useMemo } from 'react';
import {
  CommandGroup,
  CommandItem,
  CommandList,
  CommandEmpty
} from '@/renderer/app/components/ui/command';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { Contact } from '@/renderer/app/lib/db/contact';
import { ellipsisEmailString, ellipsisString } from '@/renderer/app/lib/minimizeEmail';

interface ContactCommandInputProps {
  contacts: Contact[];
  forbiddenEmails?: string[];
  onSelectionChange: (selectedContacts: Contact[]) => void;
}

const ContactCommandInput: React.FC<ContactCommandInputProps> = ({
  contacts,
  forbiddenEmails = [],
  onSelectionChange
}) => {
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);

  useEffect(() => {
    onSelectionChange(selectedContacts);
  }, [selectedContacts, onSelectionChange]);

  // Filter unique contacts & remove forbidden emails
  const uniqueContacts = useMemo(() => {
    const seen = new Map<string, Contact>();

    contacts.forEach((contact) => {
      if (!seen.has(contact.emailAddress) && !forbiddenEmails.includes(contact.emailAddress)) {
        seen.set(contact.emailAddress, contact);
      }
    });

    return Array.from(seen.values());
  }, [contacts, forbiddenEmails]);

  const [filteredContacts, setFilteredContacts] = useState<Contact[]>(uniqueContacts);

  useEffect(() => {
    setFilteredContacts(uniqueContacts);
  }, [uniqueContacts]);

  const handleSearch = (query: string) => {
    setFilteredContacts(
      uniqueContacts.filter(
        (contact) =>
          contact.displayName.toLowerCase().includes(query.toLowerCase()) ||
          contact.emailAddress.toLowerCase().includes(query.toLowerCase())
      )
    );
  };

  const toggleContactSelection = (contact: Contact) => {
    setSelectedContacts((prevSelected) =>
      prevSelected.some((c) => c.emailAddress === contact.emailAddress)
        ? prevSelected.filter((c) => c.emailAddress !== contact.emailAddress)
        : [...prevSelected, contact]
    );
  };

  return (
    <CommandList>
      <CommandEmpty>No contacts found.</CommandEmpty>
      {filteredContacts.map((contact) => (
        <CommandItem
          key={contact.emailAddress}
          onSelect={() => toggleContactSelection(contact)}
          className={`p-4 border-l-4 rounded-none ${
            selectedContacts.some((c) => c.emailAddress === contact.emailAddress)
              ? 'border-primary bg-primary/20'
              : 'border-transparent'
          }`}
        >
          <RecipientAvatar
            recipient={{ email: contact.emailAddress, name: contact.displayName }}
            className="w-6 h-6 mr-2"
          />
          <span>{`${ellipsisString(contact.displayName)} (${ellipsisEmailString(contact.emailAddress)})`}</span>
        </CommandItem>
      ))}
    </CommandList>
  );
};

export default ContactCommandInput;

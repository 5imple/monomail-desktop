export interface GoogleContactResponse {
  email: string;
  names: {
    displayName?: string;
    familyName?: string;
    givenName?: string;
  };
  profileImageUrl?: string;
}

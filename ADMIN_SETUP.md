# Admin Setup Guide for Limited Empire

## Making Your First Admin

Since admin privileges are protected and cannot be self-granted, you need to manually set the first admin in the Firebase Console.

### Step-by-Step Instructions

1. **Complete User Registration**
   - Sign in to Limited Empire with your Google account
   - Set your username
   - Note your username for reference

2. **Access Firebase Console**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your "limited-empire" project
   - Navigate to **Firestore Database** in the left sidebar

3. **Find Your User Document**
   - Click on the **users** collection
   - Look for the document with ID matching your Firebase Auth UID
   - The document ID is a long string like: `abc123xyz789...`
   - You can identify your document by checking the `username` field

4. **Set Admin Status**
   - Click on your user document to open it
   - Find the `isAdmin` field (currently set to `false`)
   - Click the `false` value to edit it
   - Change it to `true`
   - Click **Update** to save

5. **Verify Admin Access**
   - Refresh Limited Empire in your browser
   - You should now see an **Admin** button in the header
   - Click it to access the admin panel
   - You can now create and edit items

## Finding Your Firebase Auth UID

If you're not sure which document is yours:

**Option 1: Check the username field**
- Each user document has a `username` field
- Find the one matching your username

**Option 2: Check Firebase Authentication**
- In Firebase Console, go to **Authentication** → **Users**
- Find your email address
- Copy the **User UID** column value
- This is your document ID in the users collection

## Security Note

⚠️ **Important**: Admin status is stored in Firestore for this MVP. While Firestore rules prevent users from setting themselves as admin through the app, anyone with direct database access (compromised Firebase credentials) could modify this field.

For production use, consider implementing Firebase Auth Custom Claims for more secure admin authentication.

## Creating Additional Admins

Once you're an admin, you can promote other users to admin:

1. Go to Firebase Console → Firestore Database
2. Navigate to the **users** collection
3. Find the user document you want to promote
4. Edit the `isAdmin` field from `false` to `true`
5. That user will see admin features on their next page refresh

## Revoking Admin Access

To remove admin privileges:

1. Go to Firebase Console → Firestore Database
2. Navigate to the **users** collection
3. Find the admin user document
4. Edit the `isAdmin` field from `true` to `false`
5. That user will lose admin features on their next page refresh

## Troubleshooting

**"I don't see the Admin button after setting isAdmin to true"**
- Try refreshing the page (hard refresh: Ctrl+Shift+R or Cmd+Shift+R)
- Check that you edited the correct user document
- Verify the field is exactly `isAdmin` (case-sensitive)
- Make sure the value is boolean `true`, not string "true"

**"I can't find my user document"**
- Make sure you've completed the username setup in the app
- Check the Firebase Authentication panel for your User UID
- The document ID should exactly match your Auth UID

**"The admin panel isn't showing item creation options"**
- Make sure you're clicking the Admin button in the header
- Try clearing your browser cache and hard refreshing
- Check browser console for any errors

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import {GoogleOAuthProvider} from '@react-oauth/google';
import { GoogleAuthService } from './services/googleAuth';

createRoot(document.getElementById("root")!).render(<GoogleOAuthProvider clientId='509857069478-q85n7l2cogr5muodad8mtd6g7e1isdts.apps.googleusercontent.com'><App /></GoogleOAuthProvider>);

import "../styles/global.css";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DriveFile } from "@/services/driveService";
import { GoogleAuthService } from "@/services/googleAuth";
import { Download, X } from "lucide-react";


interface FilePreviewProps {
  file: DriveFile;
  onClose: () => void;
}

export const FilePreview = ({ file, onClose }: FilePreviewProps) => {
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleAuth] = useState(new GoogleAuthService());

  useEffect(() => {
    loadPreview();
  }, [file]);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // For images, use thumbnail or try to get a preview
      if (file.mimeType.startsWith('image/')) {
        if (file.thumbnailUrl) {
          setPreviewUrl(file.thumbnailUrl);
        } else if (file.downloadUrl) {
          setPreviewUrl(file.downloadUrl);
        }
      } 
      // For Google Docs, Sheets, Slides - use Google's preview
      else if (file.mimeType.includes('google-apps')) {
        const previewBase = 'https://drive.google.com/file/d';
        setPreviewUrl(`${previewBase}/${file.id}/preview`);
      }
      // For PDFs and other viewable formats
      else if (file.mimeType === 'application/pdf' || 
               file.mimeType.startsWith('text/') ||
               file.mimeType.includes('office')) {
        if (file.downloadUrl) {
          setPreviewUrl(file.downloadUrl);
        } else {
          const previewBase = 'https://drive.google.com/file/d';
          setPreviewUrl(`${previewBase}/${file.id}/preview`);
        }
      }
      else {
        setError('Preview not available for this file type');
      }
    } catch (err) {
      setError('Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (file.downloadUrl) {
      window.open(file.downloadUrl, '_blank');
    } else {
      // Fallback to Google Drive download
      window.open(`https://drive.google.com/file/d/${file.id}/view`, '_blank');
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64 sm:h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-64 sm:h-96 text-gray-500">
          <p className="text-lg mb-4">{error}</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
        </div>
      );
    }

    if (!previewUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-64 sm:h-96 text-gray-500">
          <p className="text-lg mb-4">Preview not available</p>
          <Button onClick={handleDownload} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
        </div>
      );
    }

    // Handle different file types
    if (file.mimeType.startsWith('image/')) {
      return (
        <img 
          src={previewUrl} 
          alt={file.name}
          className="max-w-full max-h-[70vh] object-contain mx-auto"
        />
      );
    } else if (file.mimeType === 'application/pdf' || 
               file.mimeType.includes('google-apps') ||
               file.mimeType.includes('office')) {
      return (
        <iframe 
          src={previewUrl}
          className="w-full h-[70vh] border-0"
          title={file.name}
        />
      );
    } else if (file.mimeType.startsWith('text/')) {
      return (
        <iframe 
          src={previewUrl}
          className="w-full h-[70vh] border border-gray-200 rounded"
          title={file.name}
        />
      );
    }

    return null;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base sm:text-lg truncate pr-4">
              {file.name}
            </DialogTitle>
            <div className="flex gap-2 flex-shrink-0">
              <Button onClick={handleDownload} variant="outline" size="sm">
                <Download className="h-4 w-4" />
              </Button>
              <Button onClick={onClose} variant="outline" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="overflow-auto">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

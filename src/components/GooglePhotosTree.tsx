import "../styles/drive-tree.css";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { DriveService, DriveFile } from "@/services/driveService";
import { GoogleAccount, GoogleAuthService } from "@/services/googleAuth";
import { Folder, Image, ChevronRight, ChevronDown, Eye, ExternalLink, Loader2, Trash2 } from "lucide-react";


interface GooglePhotosTreeProps {
  account: GoogleAccount;
  isBackup?: boolean;
  onRefresh?: () => void;
  onFilePreview?: (file: DriveFile) => void;
}

interface PhotoNode {
  id: string;
  name: string;
  type: 'folder' | 'photo';
  size?: number;
  mimeType: string;
  modifiedTime: string;
  createdTime: string;
  children?: PhotoNode[];
  expanded?: boolean;
  path: string;
  parentId?: string;
  thumbnailUrl?: string;
  metadata?: {
    location?: string;
    date?: string;
    camera?: string;
  };
}

export const GooglePhotosTree = ({ account, isBackup = false, onRefresh, onFilePreview }: GooglePhotosTreeProps) => {
  const [treeData, setTreeData] = useState<PhotoNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandingFolders, setExpandingFolders] = useState<Set<string>>(new Set());
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const { toast } = useToast();
  const [driveService] = useState(new DriveService());
  const [googleAuth] = useState(new GoogleAuthService());

  useEffect(() => {
    loadPhotosTree();
  }, [account]);

  const loadPhotosTree = async () => {
    setLoading(true);
    try {
      await googleAuth.ensureValidToken(account.id);
      const photos = await driveService.getGooglePhotos(account.id);
      const tree = buildPhotosTree(photos);
      setTreeData(tree);
    } catch (error) {
      console.error('Error loading photos tree:', error);
      toast({
        title: "Error",
        description: "Failed to load photos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const buildPhotosTree = (photos: DriveFile[]): PhotoNode[] => {
    const nodeMap = new Map<string, PhotoNode>();
    const rootNodes: PhotoNode[] = [];

    // Group photos by date/location for folder structure
    const photosByDate = new Map<string, DriveFile[]>();
    
    photos.forEach(photo => {
      const date = new Date(photo.createdTime).toISOString().split('T')[0];
      if (!photosByDate.has(date)) {
        photosByDate.set(date, []);
      }
      photosByDate.get(date)!.push(photo);
    });

    // Create date folders and photo nodes
    photosByDate.forEach((datePhotos, date) => {
      const folderId = `folder-${date}`;
      const folderNode: PhotoNode = {
        id: folderId,
        name: date,
        type: 'folder',
        mimeType: 'application/vnd.google-apps.folder',
        modifiedTime: datePhotos[0].modifiedTime,
        createdTime: datePhotos[0].createdTime,
        children: [],
        expanded: false,
        path: date
      };

      datePhotos.forEach(photo => {
        const photoNode: PhotoNode = {
          id: photo.id,
          name: photo.name,
          type: 'photo',
          size: photo.size,
          mimeType: photo.mimeType,
          modifiedTime: photo.modifiedTime,
          createdTime: photo.createdTime,
          path: `${date}/${photo.name}`,
          parentId: folderId,
          thumbnailUrl: photo.thumbnailUrl,
          metadata: {
            date: photo.createdTime,
            location: 'Unknown' // This would come from EXIF data
          }
        };
        folderNode.children!.push(photoNode);
      });

      rootNodes.push(folderNode);
    });

    return rootNodes.sort((a, b) => b.name.localeCompare(a.name));
  };

  const toggleNode = async (nodeId: string) => {
    setExpandingFolders(prev => new Set(prev).add(nodeId));
    
    const updateNodes = (nodes: PhotoNode[]): PhotoNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: updateNodes(node.children) };
        }
        return node;
      });
    };
    
    setTreeData(updateNodes(treeData));
    
    // Simulate loading time for folder expansion
    setTimeout(() => {
      setExpandingFolders(prev => {
        const updated = new Set(prev);
        updated.delete(nodeId);
        return updated;
      });
    }, 500);
  };

  const handleDragStart = (e: React.DragEvent, nodeId: string, nodeName: string) => {
    if (!isBackup) {
      e.dataTransfer.setData('application/json', JSON.stringify({
        sourceAccountId: account.id,
        fileId: nodeId,
        fileName: nodeName,
        type: 'photo'
      }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    if (!isBackup) return;
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'photo' && data.sourceAccountId !== account.id) {
        // Handle photo drop with metadata preservation
        console.log('Moving photo with metadata:', data);
      }
    } catch (error) {
      console.error('Error handling photo drop:', error);
    }
  };

  const handlePhotoPreview = (node: PhotoNode) => {
    if (onFilePreview && node.type === 'photo') {
      const driveFile: DriveFile = {
        id: node.id,
        name: node.name,
        mimeType: node.mimeType,
        size: node.size,
        modifiedTime: node.modifiedTime,
        createdTime: node.createdTime,
        accountId: account.id,
        parentId: node.parentId,
        thumbnailUrl: node.thumbnailUrl
      };
      onFilePreview(driveFile);
    }
  };

  const handleViewInDrive = (fileId: string) => {
    const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;
    window.open(driveUrl, '_blank');
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      await driveService.deleteFile(photoId, account.id);
      toast({
        title: "Success",
        description: "Photo deleted successfully",
      });
      // Refresh the photos tree
      await loadPhotosTree();
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast({
        title: "Error",
        description: "Failed to delete photo",
        variant: "destructive",
      });
    } finally {
      setDeleteItemId(null);
    }
  };

  const renderNode = (node: PhotoNode, level: number = 0): React.ReactNode => {
    const isSelected = selectedNode === node.id;
    const isExpanding = expandingFolders.has(node.id);
    const paddingLeft = `${level * 16 + 8}px`;

    return (
      <div key={node.id}>
        <div
          className={`drive-tree-node ${isSelected ? 'drive-tree-node-selected' : ''}`}
          style={{ paddingLeft }}
          onClick={() => setSelectedNode(node.id)}
          draggable={node.type === 'photo' && !isBackup}
          onDragStart={(e) => handleDragStart(e, node.id, node.name)}
          onDragOver={node.type === 'folder' && isBackup ? handleDragOver : undefined}
          onDrop={node.type === 'folder' && isBackup ? (e) => handleDrop(e, node.id) : undefined}
        >
          <div className="drive-tree-node-content">
            {node.type === 'folder' && (
              <Button
                variant="ghost"
                size="sm"
                className="drive-tree-expand-button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNode(node.id);
                }}
                disabled={isExpanding}
              >
                {isExpanding ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : node.expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            )}
            
            <div className="drive-tree-node-icon">
              {node.type === 'folder' ? (
                <Folder className="h-4 w-4 text-blue-600" />
              ) : node.thumbnailUrl ? (
                <img 
                  src={node.thumbnailUrl} 
                  alt={node.name}
                  className="tree-file-thumbnail"
                />
              ) : (
                <Image className="h-4 w-4 text-green-600" />
              )}
            </div>
            
            <span className="drive-tree-node-name">{node.name}</span>
            
            {node.type === 'photo' && (
              <span className="drive-tree-node-size">{formatBytes(node.size || 0)}</span>
            )}
          </div>
          
          <div className="drive-tree-node-actions">
            {node.type === 'photo' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="drive-tree-action-button text-blue-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePhotoPreview(node);
                  }}
                  title="Preview photo"
                >
                  <Eye className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="drive-tree-action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewInDrive(node.id);
                  }}
                  title="View in Google Drive"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="drive-tree-action-button text-red-500 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteItemId(node.id);
                      }}
                      title="Delete photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Photo</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{node.name}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeletePhoto(node.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
        
        {node.type === 'folder' && node.expanded && node.children && (
          <div className="drive-tree-children">
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="drive-tree-card">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-sm">Loading photos...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="drive-tree-card">
      <CardHeader className="drive-tree-header">
        <div className="drive-tree-header-content">
          <CardTitle className="drive-tree-title">
            {account.email} Photos ({isBackup ? 'Backup' : 'Primary'})
          </CardTitle>
        </div>
      </CardHeader>
      
      <CardContent className="drive-tree-content">
        {treeData.length === 0 ? (
          <div className="drive-tree-empty">
            No photos found
          </div>
        ) : (
          <div className="drive-tree-nodes">
            {treeData.map(node => renderNode(node))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

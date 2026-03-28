// import { generateUUID } from '@/main/utils';
// import MonoIcon from '@/renderer/app/components/icons/icons';
// import { Button } from '@/renderer/app/components/ui/button';
// import {
//   Dialog,
//   DialogContent,
//   DialogFooter,
//   DialogHeader,
//   DialogOverlay,
//   DialogPortal,
//   DialogTitle,
//   DialogTrigger
// } from '@/renderer/app/components/ui/dialog';
// import { Input } from '@/renderer/app/components/ui/input';
// import Loader from '@/renderer/app/components/ui/loader';
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue
// } from '@/renderer/app/components/ui/select';
// import { cn } from '@/renderer/app/lib/utils';
// import { useEffect, useState } from 'react';
// import { useTranslation } from 'react-i18next';

// // Available actions for filters
// const filterActions = [
//   { label: 'Never send to Spam', value: 'neverSpam' },
//   { label: 'Mark as Important', value: 'markImportant' },
//   { label: 'Categorize as Primary', value: 'categorizeAsPrimary' },
//   { label: 'Apply Label', value: 'applyLabel' },
//   { label: 'Forward to', value: 'forward' },
//   { label: 'Delete', value: 'delete' }
// ];

// // Available labels for dropdown
// const availableLabels = [
//   { value: 'important', label: 'Important' },
//   { value: 'work', label: 'Work' },
//   { value: 'personal', label: 'Personal' },
//   { value: 'finance', label: 'Finance' },
//   { value: 'social', label: 'Social' },
//   { value: 'updates', label: 'Updates' },
//   { value: 'promotions', label: 'Promotions' }
// ];

// // Format actions for display
// const formatAction = (action) => {
//   switch (action.type) {
//     case 'neverSpam':
//       return 'Never send it to Spam';
//     case 'markImportant':
//       return 'Mark it as important';
//     case 'categorizeAsPrimary':
//       return 'Categorize as Primary';
//     case 'applyLabel':
//       return `Apply label: ${action.value || '(none)'}`;
//     case 'forward':
//       return `Forward to: ${action.value || '(none)'}`;
//     case 'delete':
//       return 'Delete it';
//     default:
//       return action.type;
//   }
// };

// const AutoApplyFilterDialog = ({ children, filter, open, onOpenChange, onSave }) => {
//   const { t } = useTranslation();
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [formData, setFormData] = useState({
//     id: '',
//     matches: '',
//     actions: [{ type: 'neverSpam' }]
//   });
//   const [selectedAction, setSelectedAction] = useState('neverSpam');

//   useEffect(() => {
//     if (open) {
//       if (filter) {
//         setFormData({
//           id: filter.id,
//           matches: filter.matches,
//           actions: [...filter.actions]
//         });
//       } else {
//         setFormData({
//           id: generateUUID(),
//           matches: '',
//           actions: [{ type: 'neverSpam' }]
//         });
//       }
//     }
//   }, [filter, open]);

//   // Handle adding a new action
//   const handleAddAction = () => {
//     const newAction = { type: selectedAction };

//     // Add additional fields for actions that need them
//     if (selectedAction === 'applyLabel' || selectedAction === 'forward') {
//       newAction.value = '';
//     }

//     setFormData({
//       ...formData,
//       actions: [...formData.actions, newAction]
//     });
//   };

//   // Handle removing an action
//   const handleRemoveAction = (index) => {
//     const updatedActions = [...formData.actions];
//     updatedActions.splice(index, 1);

//     setFormData({
//       ...formData,
//       actions: updatedActions
//     });
//   };

//   // Handle updating an action value (for applyLabel and forward actions)
//   const handleUpdateActionValue = (index, value) => {
//     const updatedActions = [...formData.actions];
//     updatedActions[index].value = value;

//     setFormData({
//       ...formData,
//       actions: updatedActions
//     });
//   };

//   // Render action input field based on action type
//   const renderActionInput = (action, index) => {
//     switch (action.type) {
//       case 'applyLabel':
//         return (
//           <Select
//             value={action.value || ''}
//             onValueChange={(value) => handleUpdateActionValue(index, value)}
//           >
//             <SelectTrigger className="w-full">
//               <SelectValue placeholder="Select a label" />
//             </SelectTrigger>
//             <SelectContent>
//               {availableLabels.map((label) => (
//                 <SelectItem key={label.value} value={label.value}>
//                   {label.label}
//                 </SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         );

//       case 'forward':
//         return (
//           <Input
//             placeholder="Email address"
//             value={action.value || ''}
//             onChange={(e) => handleUpdateActionValue(index, e.target.value)}
//           />
//         );

//       default:
//         return null;
//     }
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();

//     // Basic validation
//     if (!formData.matches.trim()) {
//       return;
//     }

//     try {
//       setIsSubmitting(true);
//       await onSave(formData);
//       onOpenChange(false);
//     } catch (error) {
//       console.error('Error saving filter:', error);
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <Dialog open={open} onOpenChange={onOpenChange}>
//       <DialogTrigger asChild>{children}</DialogTrigger>
//       <DialogPortal>
//         <DialogOverlay className="dark" />
//         <DialogContent className="dark:border sm:max-w-[720px]">
//           <DialogHeader>
//             <DialogTitle>{filter?.id ? 'Edit Filter' : 'Create New Filter'}</DialogTitle>
//           </DialogHeader>

//           <form onSubmit={handleSubmit} className="space-y-4">
//             <div className="space-y-4">
//               <div>
//                 <label className="text-sm font-medium">Matches</label>
//                 <Input
//                   placeholder="e.g., from:(example.com) subject:(important)"
//                   value={formData.matches}
//                   onChange={(e) =>
//                     setFormData({
//                       ...formData,
//                       matches: e.target.value
//                     })
//                   }
//                 />
//                 <p className="mt-1 text-xs text-muted-foreground">
//                   Use Gmail search operators like from:, to:, subject:, etc.
//                 </p>
//               </div>

//               <div className="space-y-2">
//                 <label className="text-sm font-medium">Actions</label>

//                 {formData.actions.map((action, index) => (
//                   <div key={index} className="space-y-2">
//                     <div className="flex items-center justify-between rounded-md bg-muted/40 p-2">
//                       <span className="text-sm">{formatAction(action)}</span>
//                       <Button
//                         variant="ghost"
//                         sizeVariant="sm"
//                         typeVariant="icon"
//                         className="h-8 w-8 p-0"
//                         onClick={() => handleRemoveAction(index)}
//                         type="button"
//                       >
//                         <MonoIcon type="Trash" className="h-4 w-4" />
//                       </Button>
//                     </div>
//                     {renderActionInput(action, index) && (
//                       <div>{renderActionInput(action, index)}</div>
//                     )}
//                   </div>
//                 ))}

//                 <div className="mt-4 flex items-center space-x-2">
//                   <Select value={selectedAction} onValueChange={setSelectedAction}>
//                     <SelectTrigger className="w-full">
//                       <SelectValue placeholder="Select an action" />
//                     </SelectTrigger>
//                     <SelectContent>
//                       {filterActions.map((action) => (
//                         <SelectItem key={action.value} value={action.value}>
//                           {action.label}
//                         </SelectItem>
//                       ))}
//                     </SelectContent>
//                   </Select>
//                   <Button variant="outline" onClick={handleAddAction} type="button">
//                     Add Action
//                   </Button>
//                 </div>
//               </div>
//             </div>

//             <DialogFooter>
//               <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
//                 Cancel
//               </Button>
//               <Button type="submit" disabled={isSubmitting}>
//                 {isSubmitting && <Loader className="mr-2" />}
//                 {filter?.id ? 'Save Changes' : 'Create Filter'}
//               </Button>
//             </DialogFooter>
//           </form>
//         </DialogContent>
//       </DialogPortal>
//     </Dialog>
//   );
// };

// export default AutoApplyFilterDialog;

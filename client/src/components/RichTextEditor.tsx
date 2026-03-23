import { useEditor, EditorContent, ReactRenderer, Extension, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Heading from '@tiptap/extension-heading';
import Dropcursor from '@tiptap/extension-dropcursor';
import Gapcursor from '@tiptap/extension-gapcursor';
import Mention from '@tiptap/extension-mention';
import { Button } from '@/components/ui/button';
import { 
  Bold, Italic, List, ListOrdered, Quote, Heading1, Heading2, Heading3,
  Link as LinkIcon, ImageIcon, Code, Church
} from 'lucide-react';
import { uploadMedia } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { EmojiPicker } from '@/components/EmojiPicker';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

interface RichTextEditorProps {
  content: any;
  onChange: (json: any) => void;
  placeholder?: string;
  editable?: boolean;
  minimal?: boolean;
  platformId?: string;
  onMentionClick?: (id: string, type: 'user' | 'church', label: string) => void;
}

interface MentionSuggestion {
  id: string;
  name: string;
  avatar?: string;
  type?: 'user' | 'church';
}

const MentionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ id: item.id, label: item.name, type: item.type || 'user' });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  if (!props.items.length) {
    return (
      <div className="bg-popover border rounded-md shadow-md p-2 text-sm text-muted-foreground">
        No results found
      </div>
    );
  }

  return (
    <div className="bg-popover text-popover-foreground border rounded-md shadow-md overflow-hidden max-h-60 overflow-y-auto" data-testid="mention-dropdown">
      {props.items.map((item: MentionSuggestion, index: number) => (
        <button
          key={`${item.type}-${item.id}`}
          className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover-elevate ${
            index === selectedIndex ? 'bg-accent text-accent-foreground' : ''
          }`}
          onClick={() => selectItem(index)}
          data-testid={`mention-item-${item.id}`}
        >
          {item.type === 'church' ? (
            item.avatar ? (
              <img src={item.avatar} alt="" className="h-6 w-6 rounded-md object-cover" />
            ) : (
              <div className="h-6 w-6 rounded-md bg-primary/20 flex items-center justify-center">
                <Church className="h-3.5 w-3.5 text-primary" />
              </div>
            )
          ) : (
            item.avatar ? (
              <img src={item.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                {item.name.charAt(0).toUpperCase()}
              </div>
            )
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-foreground truncate">{item.name}</span>
            {item.type === 'church' && (
              <span className="text-xs text-muted-foreground">Church</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';

const SlashCommandsList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = [
    { id: 'heading1', label: 'Heading 1', icon: <Heading1 className="h-4 w-4" />, description: 'Large section heading' },
    { id: 'heading2', label: 'Heading 2', icon: <Heading2 className="h-4 w-4" />, description: 'Medium section heading' },
    { id: 'heading3', label: 'Heading 3', icon: <Heading3 className="h-4 w-4" />, description: 'Small section heading' },
    { id: 'bulletList', label: 'Bullet List', icon: <List className="h-4 w-4" />, description: 'Create a bulleted list' },
    { id: 'orderedList', label: 'Numbered List', icon: <ListOrdered className="h-4 w-4" />, description: 'Create a numbered list' },
    { id: 'blockquote', label: 'Quote', icon: <Quote className="h-4 w-4" />, description: 'Add a blockquote' },
    { id: 'image', label: 'Image', icon: <ImageIcon className="h-4 w-4" />, description: 'Upload an image' },
    { id: 'link', label: 'Link', icon: <LinkIcon className="h-4 w-4" />, description: 'Add a hyperlink' },
    { id: 'code', label: 'Code', icon: <Code className="h-4 w-4" />, description: 'Inline code snippet' },
  ];

  const filteredCommands = props.query
    ? commands.filter(c => c.label.toLowerCase().includes(props.query.toLowerCase()))
    : commands;

  const selectItem = (index: number) => {
    const item = filteredCommands[index];
    if (item) {
      props.command({ id: item.id });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + filteredCommands.length - 1) % filteredCommands.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % filteredCommands.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [filteredCommands.length]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  if (!filteredCommands.length) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-border rounded-md shadow-lg p-3 text-sm text-zinc-500 dark:text-zinc-400">
        No commands found
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-border rounded-md shadow-lg overflow-hidden max-h-80 overflow-y-auto w-64" data-testid="slash-command-menu">
      {filteredCommands.map((item, index) => (
        <button
          key={item.id}
          className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
            index === selectedIndex ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
          }`}
          onClick={() => selectItem(index)}
          data-testid={`slash-command-${item.id}`}
        >
          <div className="h-8 w-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            {item.icon}
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.label}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
});

SlashCommandsList.displayName = 'SlashCommandsList';

const hashtagPluginKey = new PluginKey('hashtag');

const HashtagHighlight = Extension.create({
  name: 'hashtagHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: hashtagPluginKey,
        state: {
          init(_, { doc }) {
            return buildHashtagDecorations(doc);
          },
          apply(tr, oldState) {
            if (tr.docChanged) {
              return buildHashtagDecorations(tr.doc);
            }
            return oldState.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

function buildHashtagDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  const hashtagRegex = /#[a-zA-Z][a-zA-Z0-9_]*/g;

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;

    const text = node.text || '';
    let match;

    while ((match = hashtagRegex.exec(text)) !== null) {
      const start = pos + match.index;
      const end = start + match[0].length;

      decorations.push(
        Decoration.inline(start, end, {
          class: 'hashtag-highlight',
        })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

function createMentionSuggestion(platformId?: string) {
  return {
    items: async ({ query }: { query: string }): Promise<MentionSuggestion[]> => {
      if (query.length < 1) return [];

      try {
        const params = new URLSearchParams({ q: query });
        if (platformId) params.set('platformId', platformId);
        const res = await fetch(`/api/mentions/search?${params}`);
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: any) => {
          if (!props.editor || props.editor.isDestroyed) return;
          
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          });
        },
        onUpdate: (props: any) => {
          if (!props.editor || props.editor.isDestroyed) return;
          component?.updateProps(props);
          if (popup?.[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            });
          }
        },
        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          return (component?.ref as any)?.onKeyDown?.(props);
        },
        onExit: () => {
          popup?.[0]?.destroy();
          popup = null;
          component?.destroy();
          component = null;
        },
      };
    },
  };
}

function createSlashCommandSuggestion(handleImageUpload: () => void, handleAddLink: () => void) {
  return {
    char: '/',
    command: ({ editor, range, props }: any) => {
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().deleteRange(range).run();

      switch (props.id) {
        case 'heading1':
          editor.chain().focus().toggleHeading({ level: 1 }).run();
          break;
        case 'heading2':
          editor.chain().focus().toggleHeading({ level: 2 }).run();
          break;
        case 'heading3':
          editor.chain().focus().toggleHeading({ level: 3 }).run();
          break;
        case 'bulletList':
          editor.chain().focus().toggleBulletList().run();
          break;
        case 'orderedList':
          editor.chain().focus().toggleOrderedList().run();
          break;
        case 'blockquote':
          editor.chain().focus().toggleBlockquote().run();
          break;
        case 'image':
          handleImageUpload();
          break;
        case 'link':
          handleAddLink();
          break;
        case 'code':
          editor.chain().focus().toggleCode().run();
          break;
      }
    },
    items: ({ query }: { query: string }) => {
      return [{ query }];
    },
    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: any) => {
          if (!props.editor || props.editor.isDestroyed) return;
          
          component = new ReactRenderer(SlashCommandsList, {
            props: { ...props, query: props.query },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          });
        },
        onUpdate: (props: any) => {
          if (!props.editor || props.editor.isDestroyed) return;
          component?.updateProps({ ...props, query: props.query });
          if (popup?.[0]) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            });
          }
        },
        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          return (component?.ref as any)?.onKeyDown?.(props);
        },
        onExit: () => {
          popup?.[0]?.destroy();
          popup = null;
          component?.destroy();
          component = null;
        },
      };
    },
  };
}

const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: () => {},
        items: () => [],
        render: () => ({}),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('slashCommands'),
        props: {
          handleKeyDown: (view, event) => {
            if (event.key === '/' && view.state.selection.empty) {
              const { $from } = view.state.selection;
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
              if (textBefore === '' || textBefore.endsWith(' ') || textBefore.endsWith('\n')) {
                return false;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

export function RichTextEditor({ 
  content, 
  onChange, 
  placeholder = "Type '/' for commands, @ to mention someone...",
  editable = true,
  minimal = false,
  platformId,
  onMentionClick
}: RichTextEditorProps) {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const handleImageUpload = useCallback(async (file: File) => {
    toast({
      title: "Uploading image...",
      description: "Please wait while your image is being uploaded.",
    });

    const result = await uploadMedia(file);
    
    if (result && editor) {
      editor.chain().focus().setImage({ src: result.url }).run();
      toast({
        title: "Image uploaded",
        description: "Your image has been added to the post.",
      });
    } else {
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const triggerImageUpload = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const addLink = useCallback(() => {
    const url = window.prompt('Enter URL:');
    if (url && editorRef.current) {
      editorRef.current.chain().focus().setLink({ href: url }).run();
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        dropcursor: false,
        gapcursor: false,
        link: false,
      }),
      Heading.configure({
        levels: [1, 2, 3],
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-md max-w-full h-auto my-4',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Dropcursor.configure({
        color: 'hsl(var(--primary))',
        width: 2,
      }),
      Gapcursor,
      HashtagHighlight,
      Mention.extend({
        addAttributes() {
          return {
            id: { default: null },
            label: { default: null },
            type: {
              default: 'user',
              parseHTML: (element: HTMLElement) => element.getAttribute('data-mention-type') || 'user',
              renderHTML: (attributes: Record<string, any>) => ({
                'data-mention-type': attributes.type || 'user',
              }),
            },
          };
        },
      }).configure({
        HTMLAttributes: {
          class: 'mention-badge',
        },
        renderHTML({ options, node }) {
          const mentionType = node.attrs.type || 'user';
          const classList = mentionType === 'church' ? 'mention-badge mention-church' : 'mention-badge';
          return [
            'span',
            { ...options.HTMLAttributes, class: classList, 'data-mention-type': mentionType, 'data-id': node.attrs.id },
            `@${node.attrs.label ?? node.attrs.id}`,
          ];
        },
        suggestion: {
          ...createMentionSuggestion(platformId),
          allowSpaces: true,
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: {
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) {
                handleImageUpload(file);
                return true;
              }
            }
          }
        }
        return false;
      },
      handleKeyDown: (view, event) => {
        console.log('RichTextEditor keydown:', event.key, 'empty selection:', view.state.selection.empty);
        if (event.key === '/' && view.state.selection.empty) {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                          (window.matchMedia && window.matchMedia('(max-width: 768px)').matches && 'ontouchstart' in window);
          if (isMobile) {
            return false;
          }
          const { $from } = view.state.selection;
          const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
          console.log('Slash pressed, textBefore:', JSON.stringify(textBefore));
          if (textBefore === '' || textBefore.endsWith(' ') || textBefore.endsWith('\n')) {
            console.log('Showing slash menu');
            setTimeout(() => {
              if (editorRef.current) {
                showSlashMenu(editorRef.current, view, triggerImageUpload, addLink);
              }
            }, 0);
            return true;
          }
        }
        return false;
      },
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
    e.target.value = '';
  }, [handleImageUpload]);

  // Keep editorRef in sync with editor for use in handleKeyDown
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Update editor's editable state when prop changes
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    return () => {
      if (slashMenuPopup) {
        slashMenuPopup.destroy();
        slashMenuPopup = null;
      }
      if (slashMenuElement) {
        slashMenuElement.remove();
        slashMenuElement = null;
      }
    };
  }, []);

  if (!editor) {
    return null;
  }

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const mention = target.closest('[data-mention-type]') as HTMLElement;
    if (mention && onMentionClick) {
      e.preventDefault();
      e.stopPropagation();
      const mentionType = mention.getAttribute('data-mention-type') as 'user' | 'church';
      const mentionId = mention.getAttribute('data-id') || '';
      const label = mention.textContent?.replace('@', '') || '';
      onMentionClick(mentionId, mentionType, label);
    }
  }, [onMentionClick]);

  if (!editable) {
    return (
      <div className="prose dark:prose-invert max-w-none rich-text-content" onClick={handleContentClick}>
        <EditorContent editor={editor} />
        <style>{`
          .mention-badge {
            display: inline-flex;
            align-items: center;
            padding: 0 0.375rem;
            margin: 0 0.125rem;
            background: hsl(var(--primary) / 0.15);
            color: hsl(var(--primary));
            border-radius: 9999px;
            font-weight: 500;
            font-size: 0.875em;
            cursor: pointer;
          }
          .mention-badge.mention-church {
            border-radius: 0.375rem;
          }
          .hashtag-highlight {
            color: hsl(var(--primary));
            font-weight: 500;
          }
        `}</style>
      </div>
    );
  }

  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleCode = () => editor.chain().focus().toggleCode().run();
  const toggleBulletList = () => editor.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run();
  const toggleBlockquote = () => editor.chain().focus().toggleBlockquote().run();
  const setHeading = (level: 1 | 2 | 3) => editor.chain().focus().toggleHeading({ level }).run();

  const handleAddLink = () => {
    const url = window.prompt('URL');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  if (minimal) {
    return (
      <div className="border rounded-md">
        <input
          type="file"
          ref={imageInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
        <div 
          className="prose dark:prose-invert max-w-none p-4 min-h-[100px] focus-within:outline-none rich-text-content"
          data-testid="editor-content-minimal"
        >
          <EditorContent editor={editor} />
        </div>
        <style>{`
          .mention-badge {
            display: inline-flex;
            align-items: center;
            padding: 0 0.375rem;
            margin: 0 0.125rem;
            background: hsl(var(--primary) / 0.15);
            color: hsl(var(--primary));
            border-radius: 9999px;
            font-weight: 500;
            font-size: 0.875em;
            cursor: pointer;
          }
          .mention-badge.mention-church {
            border-radius: 0.375rem;
          }
          .hashtag-highlight {
            color: hsl(var(--primary));
            font-weight: 500;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <input
        type="file"
        ref={imageInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'ghost'}
          onClick={() => setHeading(1)}
          data-testid="button-h1"
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'}
          onClick={() => setHeading(2)}
          data-testid="button-h2"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('heading', { level: 3 }) ? 'default' : 'ghost'}
          onClick={() => setHeading(3)}
          data-testid="button-h3"
        >
          <Heading3 className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('bold') ? 'default' : 'ghost'}
          onClick={toggleBold}
          data-testid="button-bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('italic') ? 'default' : 'ghost'}
          onClick={toggleItalic}
          data-testid="button-italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('code') ? 'default' : 'ghost'}
          onClick={toggleCode}
          data-testid="button-code"
        >
          <Code className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
          onClick={toggleBulletList}
          data-testid="button-bullet-list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
          onClick={toggleOrderedList}
          data-testid="button-ordered-list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('blockquote') ? 'default' : 'ghost'}
          onClick={toggleBlockquote}
          data-testid="button-quote"
        >
          <Quote className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('link') ? 'default' : 'ghost'}
          onClick={handleAddLink}
          data-testid="button-link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={triggerImageUpload}
          data-testid="button-image"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <EmojiPicker 
          onEmojiSelect={(emoji) => {
            editor.chain().focus().insertContent(emoji).run();
          }}
        />
      </div>

      <div 
        className="prose dark:prose-invert max-w-none p-6 min-h-[300px] focus-within:outline-none rich-text-content"
        data-testid="editor-content"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/10">
        <span className="hidden sm:inline">Tip: Type "/" for commands, "@" to mention someone, or "#" for hashtags</span>
        <span className="sm:hidden">Tip: Use the toolbar above to format, "@" to mention, or "#" for hashtags</span>
      </div>

      <style>{`
        .mention-badge {
          display: inline-flex;
          align-items: center;
          padding: 0 0.375rem;
          margin: 0 0.125rem;
          background: hsl(var(--primary) / 0.15);
          color: hsl(var(--primary));
          border-radius: 9999px;
          font-weight: 500;
          font-size: 0.875em;
        }
        .hashtag-highlight {
          color: hsl(var(--primary));
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

let slashMenuPopup: TippyInstance | null = null;
let slashMenuElement: HTMLDivElement | null = null;

function showSlashMenu(editor: Editor, view: any, handleImageUpload: () => void, handleAddLink: () => void) {
  try {
    console.log('showSlashMenu called');
    
    if (slashMenuPopup) {
      slashMenuPopup.destroy();
      slashMenuPopup = null;
    }
    if (slashMenuElement) {
      slashMenuElement.remove();
      slashMenuElement = null;
    }

    const { from } = view.state.selection;
    const coords = view.coordsAtPos(from);
    console.log('Coords:', coords);

    const commands = [
      { id: 'heading1', label: 'Heading 1', icon: 'H1', description: 'Large section heading' },
      { id: 'heading2', label: 'Heading 2', icon: 'H2', description: 'Medium section heading' },
      { id: 'heading3', label: 'Heading 3', icon: 'H3', description: 'Small section heading' },
      { id: 'bulletList', label: 'Bullet List', icon: '•', description: 'Create a bulleted list' },
      { id: 'orderedList', label: 'Numbered List', icon: '1.', description: 'Create a numbered list' },
      { id: 'blockquote', label: 'Quote', icon: '"', description: 'Add a blockquote' },
      { id: 'image', label: 'Image', icon: '📷', description: 'Upload an image' },
      { id: 'link', label: 'Link', icon: '🔗', description: 'Add a hyperlink' },
    ];

    let selectedIndex = 0;

    const handleCommand = (id: string) => {
      slashMenuPopup?.hide();

      // Use Tiptap editor commands directly to maintain focus
      switch (id) {
        case 'heading1':
          editor.chain().focus().toggleHeading({ level: 1 }).run();
          break;
        case 'heading2':
          editor.chain().focus().toggleHeading({ level: 2 }).run();
          break;
        case 'heading3':
          editor.chain().focus().toggleHeading({ level: 3 }).run();
          break;
        case 'bulletList':
          editor.chain().focus().toggleBulletList().run();
          break;
        case 'orderedList':
          editor.chain().focus().toggleOrderedList().run();
          break;
        case 'blockquote':
          editor.chain().focus().toggleBlockquote().run();
          break;
        case 'image':
          handleImageUpload();
          break;
        case 'link':
          handleAddLink();
          break;
      }
    };

    // Create DOM element directly
    slashMenuElement = document.createElement('div');
    slashMenuElement.setAttribute('data-testid', 'slash-command-menu');
    slashMenuElement.style.cssText = `
      background: hsl(var(--popover));
      color: hsl(var(--popover-foreground));
      border: 1px solid hsl(var(--border));
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      max-height: 320px;
      overflow-y: auto;
      width: 256px;
    `;

    const updateSelection = () => {
      if (!slashMenuElement) return;
      slashMenuElement.querySelectorAll('.slash-menu-item').forEach((item, index) => {
        (item as HTMLElement).style.background = index === selectedIndex ? 'hsl(var(--accent))' : 'transparent';
      });
    };

    // Build menu items
    slashMenuElement.innerHTML = commands.map((cmd, index) => `
      <button
        class="slash-menu-item"
        data-id="${cmd.id}"
        data-index="${index}"
        style="
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 10px 12px;
          text-align: left;
          border: none;
          background: ${index === selectedIndex ? 'hsl(var(--accent))' : 'transparent'};
          cursor: pointer;
        "
      >
        <div style="
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: hsl(var(--muted));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
        ">${cmd.icon}</div>
        <div>
          <div style="font-size: 14px; font-weight: 500; color: hsl(var(--foreground));">${cmd.label}</div>
          <div style="font-size: 12px; color: hsl(var(--muted-foreground));">${cmd.description}</div>
        </div>
      </button>
    `).join('');

    // Use event delegation for click and hover
    slashMenuElement.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest('.slash-menu-item');
      if (button) {
        const id = (button as HTMLElement).dataset.id;
        if (id) handleCommand(id);
      }
    });

    slashMenuElement.addEventListener('mouseover', (e) => {
      const button = (e.target as HTMLElement).closest('.slash-menu-item');
      if (button) {
        const index = parseInt((button as HTMLElement).dataset.index || '0', 10);
        if (index !== selectedIndex) {
          selectedIndex = index;
          updateSelection();
        }
      }
    });

    console.log('Creating tippy popup at coords:', coords);
    console.log('Menu element:', slashMenuElement);
    
    const [popup] = tippy('body', {
      getReferenceClientRect: () => ({
        width: 0,
        height: 0,
        top: coords.top,
        bottom: coords.bottom,
        left: coords.left,
        right: coords.left,
        x: coords.left,
        y: coords.top,
        toJSON: () => ({}),
      }),
      appendTo: () => document.body,
      content: slashMenuElement,
      showOnCreate: true,
      interactive: true,
      trigger: 'manual',
      placement: 'bottom-start',
      zIndex: 99999,
    });
    
    console.log('Popup created:', popup);
    slashMenuPopup = popup;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        slashMenuPopup?.hide();
        document.removeEventListener('keydown', handleKeydown);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % commands.length;
        updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + commands.length) % commands.length;
        updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleCommand(commands[selectedIndex].id);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (!slashMenuElement?.contains(e.target as globalThis.Node)) {
        slashMenuPopup?.hide();
        document.removeEventListener('click', handleClick);
        document.removeEventListener('keydown', handleKeydown);
      }
    };

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('click', handleClick);

    popup.setProps({
      onHide: () => {
        document.removeEventListener('keydown', handleKeydown);
        document.removeEventListener('click', handleClick);
      },
    });
  } catch (error) {
    console.error('Error in showSlashMenu:', error);
  }
}

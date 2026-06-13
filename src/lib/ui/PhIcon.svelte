<script lang="ts">
	import type { Component } from 'svelte';

	// Statically-imported Phosphor icons used throughout the chrome. unplugin-icons inlines each
	// as a Svelte component at build time (offline). Keyed by a stable slug we reference in code.
	import Cursor from '~icons/ph/cursor';
	import HandIcon from '~icons/ph/hand';
	import Frame from '~icons/ph/frame-corners';
	import Square from '~icons/ph/square';
	import CardsIcon from '~icons/ph/cards';
	import NavIcon from '~icons/ph/list';
	import SidebarIcon from '~icons/ph/sidebar';
	import TextT from '~icons/ph/text-t';
	import ButtonIcon from '~icons/ph/rectangle';
	import InputIcon from '~icons/ph/textbox';
	import TableIcon from '~icons/ph/table';
	import ChartIcon from '~icons/ph/chart-line';
	import ImageIcon from '~icons/ph/image';
	import ListIcon from '~icons/ph/list-bullets';
	import TabsIcon from '~icons/ph/tabs';
	import ModalIcon from '~icons/ph/browser';
	import StarIcon from '~icons/ph/star';
	import DividerIcon from '~icons/ph/minus';
	import Undo from '~icons/ph/arrow-counter-clockwise';
	import Redo from '~icons/ph/arrow-clockwise';
	import ZoomIn from '~icons/ph/magnifying-glass-plus';
	import ZoomOut from '~icons/ph/magnifying-glass-minus';
	import Fit from '~icons/ph/corners-out';
	import Trash from '~icons/ph/trash';
	import Copy from '~icons/ph/copy';
	import Front from '~icons/ph/stack-plus';
	import Back from '~icons/ph/stack-minus';
	import FileNew from '~icons/ph/file-plus';
	import FolderOpen from '~icons/ph/folder-open';
	import Save from '~icons/ph/floppy-disk';
	import Export from '~icons/ph/export';
	import Library from '~icons/ph/books';
	import Eye from '~icons/ph/eye';
	import EyeSlash from '~icons/ph/eye-slash';
	import Lock from '~icons/ph/lock-simple';
	import LockOpen from '~icons/ph/lock-simple-open';
	import CaretRight from '~icons/ph/caret-right';
	import CaretDown from '~icons/ph/caret-down';
	import Search from '~icons/ph/magnifying-glass';
	import X from '~icons/ph/x';
	import Plus from '~icons/ph/plus';
	import AlignLeft from '~icons/ph/align-left-simple';
	import AlignRight from '~icons/ph/align-right-simple';
	import AlignTop from '~icons/ph/align-top-simple';
	import AlignBottom from '~icons/ph/align-bottom-simple';
	import AlignCenterH from '~icons/ph/align-center-horizontal-simple';
	import AlignCenterV from '~icons/ph/align-center-vertical-simple';
	import FlipH from '~icons/ph/flip-horizontal';
	import FlipV from '~icons/ph/flip-vertical';
	import Rows from '~icons/ph/rows';
	import Columns from '~icons/ph/columns';
	import Keyboard from '~icons/ph/keyboard';

	const MAP: Record<string, Component> = {
		select: Cursor,
		hand: HandIcon,
		frame: Frame,
		container: Square,
		card: CardsIcon,
		nav: NavIcon,
		sidebar: SidebarIcon,
		text: TextT,
		button: ButtonIcon,
		input: InputIcon,
		table: TableIcon,
		chart: ChartIcon,
		image: ImageIcon,
		list: ListIcon,
		tabs: TabsIcon,
		modal: ModalIcon,
		icon: StarIcon,
		divider: DividerIcon,
		undo: Undo,
		redo: Redo,
		'zoom-in': ZoomIn,
		'zoom-out': ZoomOut,
		fit: Fit,
		trash: Trash,
		copy: Copy,
		front: Front,
		back: Back,
		'file-new': FileNew,
		open: FolderOpen,
		save: Save,
		export: Export,
		library: Library,
		eye: Eye,
		'eye-slash': EyeSlash,
		lock: Lock,
		'lock-open': LockOpen,
		'caret-right': CaretRight,
		'caret-down': CaretDown,
		search: Search,
		x: X,
		plus: Plus,
		'align-left': AlignLeft,
		'align-right': AlignRight,
		'align-top': AlignTop,
		'align-bottom': AlignBottom,
		'align-center-h': AlignCenterH,
		'align-center-v': AlignCenterV,
		'flip-h': FlipH,
		'flip-v': FlipV,
		'distribute-h': Columns,
		'distribute-v': Rows,
		keyboard: Keyboard
	};

	let { name, size = 18 }: { name: string; size?: number } = $props();

	const Resolved = $derived(MAP[name] ?? Square);
</script>

<span class="ph-icon" style:--sz="{size}px" aria-hidden="true">
	<Resolved />
</span>

<style>
	.ph-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		inline-size: var(--sz);
		block-size: var(--sz);
		font-size: var(--sz);
		line-height: 0;
		color: currentColor;
	}
	.ph-icon :global(svg) {
		inline-size: 1em;
		block-size: 1em;
		display: block;
	}
</style>

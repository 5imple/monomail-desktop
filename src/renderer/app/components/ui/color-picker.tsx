import { useState } from 'react';
import { ColorPicker, useColor } from 'react-color-palette';
import 'react-color-palette/css';

const colors = ['#ffdd57', '#a3e635', '#38bdf8', '#ef4444', '#f472b6', '#000000', '#ffffff'];

export const EditorColorPicker = ({
  onColorSelect,
  onInteraction
}: {
  onColorSelect: (type: 'background' | 'text', color: string) => void;
  onInteraction: (e: React.MouseEvent) => void;
}) => {
  const [activeTab, setActiveTab] = useState<'background' | 'text'>('background');
  const [color, setColor] = useColor('#000000');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  return (
    <>
      <div className="flex justify-around mb-4" onClick={onInteraction}>
        <button
          className={`w-24 py-1 rounded-md text-sm font-medium ${
            activeTab === 'background' ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('background')}
        >
          Background
        </button>
        <button
          className={`w-24 py-1 rounded-md text-sm font-medium ${
            activeTab === 'text' ? 'bg-gray-300' : 'hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('text')}
        >
          Text
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {colors.map((color) => (
          <div
            key={color}
            className="w-8 h-8 rounded-full cursor-pointer border hover:border-gray-500"
            style={{ backgroundColor: color }}
            onClick={() => onColorSelect(activeTab, color)}
          />
        ))}
        <div
          className="w-8 h-8 rounded-full cursor-pointer border hover:border-gray-500 flex items-center justify-center"
          style={{ background: 'conic-gradient(red, yellow, green, cyan, blue, magenta, red)' }}
          onClick={() => setShowCustomPicker((prev) => !prev)}
        >
          🎨
        </div>
      </div>

      {showCustomPicker && (
        <div className="mt-4">
          <ColorPicker
            height={200}
            color={color}
            onChange={setColor}
            hideInput={true}
            onChangeComplete={(selectedColor) => {
              const { hex } = selectedColor;
              onColorSelect(activeTab, hex);
            }}
          />
        </div>
      )}
    </>
  );
};

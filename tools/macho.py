"""Read the 32-bit little-endian Mach-O used by the supplied game."""

import struct


def parse(data):
    if len(data) < 28 or struct.unpack_from('<I', data)[0] != 0xFEEDFACE:
        raise ValueError('Expected a thin, little-endian 32-bit Mach-O')
    _, cpu, subtype, _, count, command_bytes, _ = struct.unpack_from('<7I', data)
    if cpu != 12 or 28 + command_bytes > len(data):
        raise ValueError('Invalid ARM Mach-O header')
    segments, sections, symbols, imports = [], [], {}, {}
    symtab = dysymtab = None
    offset = 28
    for _ in range(count):
        if offset + 8 > 28 + command_bytes:
            raise ValueError('Truncated load command')
        cmd, size = struct.unpack_from('<II', data, offset)
        if size < 8 or offset + size > 28 + command_bytes:
            raise ValueError('Invalid load command size')
        if cmd == 1:
            _, _, name, address, memory_size, file_offset, file_size, _, _, nsects, _ = struct.unpack_from('<II16s8I', data, offset)
            if file_offset + file_size > len(data) or 56 + 68 * nsects > size:
                raise ValueError('Invalid segment bounds')
            segments.append(dict(name=name.split(b'\0')[0].decode(), address=address,
                                 memorySize=memory_size, fileOffset=file_offset, fileSize=file_size))
            for i in range(nsects):
                values = struct.unpack_from('<16s16s9I', data, offset + 56 + 68 * i)
                sections.append(dict(name=values[0].split(b'\0')[0].decode(),
                                     address=values[2], size=values[3], fileOffset=values[4],
                                     flags=values[8], reserved1=values[9], reserved2=values[10]))
        elif cmd == 2:
            symtab = struct.unpack_from('<4I', data, offset + 8)
        elif cmd == 0xB:
            dysymtab = struct.unpack_from('<18I', data, offset + 8)
        elif cmd == 0x21 and struct.unpack_from('<I', data, offset + 16)[0]:
            raise ValueError('Encrypted executables are not supported')
        offset += size
    if not symtab:
        raise ValueError('No symbol table')
    table, nsymbols, strings, string_size = symtab
    if table + nsymbols * 12 > len(data) or strings + string_size > len(data):
        raise ValueError('Invalid symbol table bounds')
    names = []
    for i in range(nsymbols):
        index, kind, _, _, value = struct.unpack_from('<IBBHI', data, table + i * 12)
        if index >= string_size:
            raise ValueError('Invalid symbol name offset')
        end = data.find(b'\0', strings + index, strings + string_size)
        if end < 0:
            raise ValueError('Unterminated symbol')
        name = data[strings + index:end].decode('utf-8', errors='replace')
        names.append(name)
        if value and not kind & 0xE0:
            symbols[name] = value
    if dysymtab:
        indirect, nindirect = dysymtab[12:14]
        if indirect + nindirect * 4 > len(data):
            raise ValueError('Invalid indirect symbols')
        for section in sections:
            if section['flags'] & 0xFF != 8:
                continue
            stride = section['reserved2']
            if not stride:
                raise ValueError('Invalid symbol stub stride')
            for i in range(section['size'] // stride):
                index = section['reserved1'] + i
                if index >= nindirect:
                    raise ValueError('Invalid stub symbol offset')
                symbol, = struct.unpack_from('<I', data, indirect + index * 4)
                if symbol < len(names):
                    imports[section['address'] + i * stride] = names[symbol]
    return dict(cpu=cpu, subtype=subtype, segments=segments, sections=sections,
                symbols=symbols, imports=imports)
